package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	aiclient    "mammo/apps/core/internal/adapters/ai_client"
	"mammo/apps/core/internal/adapters/filesystem"
	httpadapter "mammo/apps/core/internal/adapters/http"
	"mammo/apps/core/internal/adapters/sqlite"
	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/config"
	"mammo/apps/core/internal/infrastructure/guardian"
	"mammo/apps/core/internal/infrastructure/queue"
)

func main() {
	cfg := config.Load()

	for _, dir := range []string{filepath.Dir(cfg.SQLitePath), cfg.LocalDataRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	db, err := sqlite.Open(cfg.SQLitePath)
	if err != nil {
		log.Fatalf("sqlite: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sidecarBin, sidecarArgs, sidecarDir := buildSidecarCmd(cfg)
	supervisor := guardian.New(sidecarBin, sidecarArgs, sidecarDir,
		cfg.AISidecarURL+"/health",
		time.Duration(cfg.GuardianBackoffMs)*time.Millisecond,
		cfg.GuardianMaxFails)
	switch {
	case cfg.AIEngineDisabled:
		supervisor.Disable("AI_ENGINE_DISABLED=1")
		log.Printf("ai sidecar disabled by config")
	default:
		if err := supervisor.Start(ctx); err != nil {
			log.Printf("sidecar start: %v", err)
		}
		go supervisor.Watch(ctx, 2*time.Second)
	}

	taskQ := queue.New(4, 128)
	taskQ.Start(ctx, queue.LogProcessor{})

	studyRepo := sqlite.NewStudyRepository(db)
	annotRepo := sqlite.NewAnnotationRepository(db)
	patientRepo := sqlite.NewPatientRepository(db)
	aiClient  := aiclient.New(cfg.AISidecarURL, cfg.AISharedToken)
	dicomReader := filesystem.NewDICOMReader()

	ensurePatient := usecase.NewEnsurePatient(patientRepo)
	updatePatient := usecase.NewUpdatePatient(patientRepo)

	router := httpadapter.NewRouter(
		httpadapter.NewPDIHandler(usecase.NewApplyWindowing()),
		httpadapter.NewStudyHandler(
			usecase.NewOpenStudy(studyRepo, dicomReader, ensurePatient),
			usecase.NewSaveAnnotations(annotRepo),
			usecase.NewLoadAnnotations(annotRepo),
			studyRepo,
		),
		httpadapter.NewInferenceHandler(usecase.NewRunInference(aiClient, taskQ)),
		httpadapter.NewExportHandler(
			usecase.NewExportDataset(studyRepo, annotRepo),
			studyRepo,
			annotRepo,
		),
		httpadapter.NewPreviewHandler(studyRepo, annotRepo, dicomReader),
		httpadapter.NewBackupHandler(db, cfg.SQLitePath),
		httpadapter.NewPatientHandler(patientRepo, studyRepo, updatePatient),
	)
	httpadapter.NewHealthHandler(supervisor).RegisterRoutes(router)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("go-core listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// buildSidecarCmd resolves the Python binary and uvicorn arguments.
// Resolution order for the Python binary:
//  1. AI_ENGINE_EXEC (full command override)
//  2. AI_ENGINE_PYTHON env var (explicit path)
//  3. .venv/bin/python inside the ai-engine directory
//  4. exec.LookPath("python3") — system fallback
func buildSidecarCmd(cfg config.Config) (string, []string, string) {
	if cfg.AISidecarExec != "" {
		return cfg.AISidecarExec, []string{}, cfg.AISidecarWorkDir
	}

	workDir := cfg.AISidecarWorkDir
	if workDir == "" {
		// Resolve relative to this binary's location so it works from any cwd.
		exe, _ := os.Executable()
		workDir = filepath.Join(filepath.Dir(exe), "..", "..", "ai-engine")
		if _, err := os.Stat(workDir); err != nil {
			// Fallback: relative to current working directory (dev mode).
			workDir = filepath.Join("..", "..", "ai-engine")
		}
	}

	python := resolvePython(cfg.AISidecarPython, workDir)

	args := []string{"-m", "uvicorn", "app.main:app",
		"--host", "127.0.0.1", "--port", "8090", "--no-access-log"}
	if cfg.AISidecarScript != "app/main.py" {
		args = []string{cfg.AISidecarScript}
	}

	return python, args, workDir
}

// resolvePython returns an absolute path to a working Python 3 interpreter.
func resolvePython(configured, workDir string) string {
	// 1. If explicitly configured and the path exists, use it directly.
	if configured != "" && configured != "python3" {
		if abs, err := filepath.Abs(configured); err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
		return configured
	}

	// 2. Prefer the venv inside the ai-engine directory.
	candidates := []string{
		filepath.Join(workDir, ".venv", "bin", "python"),
		filepath.Join(workDir, ".venv", "bin", "python3"),
	}
	for _, c := range candidates {
		if abs, err := filepath.Abs(c); err == nil {
			if info, err := os.Stat(abs); err == nil && !info.IsDir() {
				return abs
			}
		}
	}

	// 3. exec.LookPath resolves symlinks and returns the real path.
	if p, err := exec.LookPath("python3"); err == nil {
		return p
	}

	return "python3" // last resort
}

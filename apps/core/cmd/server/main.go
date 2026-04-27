package main

import (
	"context"
	"fmt"
	"log"
	"os"
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
		time.Duration(cfg.GuardianBackoffMs)*time.Millisecond)
	if err := supervisor.Start(ctx); err != nil {
		log.Printf("sidecar start: %v", err)
	}
	go supervisor.Watch(ctx, 2*time.Second)

	taskQ := queue.New(4, 128)
	taskQ.Start(ctx, queue.LogProcessor{})

	studyRepo := sqlite.NewStudyRepository(db)
	annotRepo := sqlite.NewAnnotationRepository(db)
	aiClient  := aiclient.New(cfg.AISidecarURL, cfg.AISharedToken)

	router := httpadapter.NewRouter(
		httpadapter.NewPDIHandler(usecase.NewApplyWindowing()),
		httpadapter.NewStudyHandler(
			usecase.NewOpenStudy(studyRepo, filesystem.NewDICOMReader()),
			usecase.NewSaveAnnotations(annotRepo),
			usecase.NewLoadAnnotations(annotRepo),
			studyRepo,
		),
		httpadapter.NewInferenceHandler(usecase.NewRunInference(aiClient, taskQ)),
	)
	httpadapter.NewHealthHandler(supervisor).RegisterRoutes(router)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("go-core listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func buildSidecarCmd(cfg config.Config) (string, []string, string) {
	if cfg.AISidecarExec != "" {
		return cfg.AISidecarExec, []string{}, cfg.AISidecarWorkDir
	}
	workDir := cfg.AISidecarWorkDir
	if workDir == "" {
		workDir = filepath.Join("..", "..", "ai-engine")
	}
	if cfg.AISidecarScript == "app/main.py" {
		return cfg.AISidecarPython, []string{
			"-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8090",
		}, workDir
	}
	return cfg.AISidecarPython, []string{cfg.AISidecarScript}, workDir
}

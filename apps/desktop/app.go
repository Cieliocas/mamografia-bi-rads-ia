package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const goCoreAddr = "127.0.0.1:8088"

// App is the Wails application struct.
type App struct {
	ctx     context.Context
	coreCmd *exec.Cmd
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup is called by Wails after the window is ready.
// It saves the context and, in bundled mode, launches the Go Core sidecar.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.launchGoCore()
}

// shutdown is called by Wails when the window closes.
// It terminates the Go Core sidecar if we own it.
func (a *App) shutdown(_ context.Context) {
	if a.coreCmd == nil || a.coreCmd.Process == nil {
		return
	}
	log.Println("[desktop] shutting down go-core…")
	_ = a.coreCmd.Process.Kill()
	// Give it up to 2 s to exit cleanly before we abandon the wait.
	done := make(chan error, 1)
	go func() { done <- a.coreCmd.Wait() }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
	}
}

// launchGoCore starts the Go Core binary as a managed subprocess.
//
// It is skipped when:
//   - GO_CORE_EXTERNAL=1  — set by run_desktop_dev.sh so the dev-loop keeps
//     ownership of the core process, avoiding a double-launch.
//   - The go-core binary cannot be found (degraded mode: no storage, no AI,
//     but the viewer canvas still works for file-opened images).
func (a *App) launchGoCore() {
	if os.Getenv("GO_CORE_EXTERNAL") == "1" {
		log.Println("[desktop] GO_CORE_EXTERNAL=1 — skipping go-core auto-launch")
		return
	}

	// Detect port collision before spawning. A stale dev binary squatting on
	// 8088 would silently take requests from the frontend and serve outdated
	// routes (e.g. preview 404s), making "Abrir" appear broken.
	if conn, err := net.DialTimeout("tcp", goCoreAddr, 200*time.Millisecond); err == nil {
		_ = conn.Close()
		a.fatalDialog(
			"Porta 8088 em uso",
			"Outro processo já está escutando em "+goCoreAddr+
				" (provavelmente um go-core de desenvolvimento).\n\n"+
				"Encerre-o e reabra o AIdentify:\n"+
				"  lsof -ti :8088 | xargs kill",
		)
		return
	}

	bin, err := goCoreExecutable()
	if err != nil {
		log.Printf("[desktop] go-core not found (%v) — running in viewer-only mode", err)
		return
	}

	cmd := exec.Command(bin)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	// Apps launched via Finder inherit a minimal PATH that excludes Homebrew.
	// go-core shells out to dcmdjpeg/gdcmconv for compressed DICOMs, so prepend
	// the standard Homebrew locations.
	cmd.Env = append(os.Environ(), "PATH="+augmentedPATH())
	if err := cmd.Start(); err != nil {
		a.fatalDialog("Falha ao iniciar go-core", fmt.Sprintf("%v", err))
		return
	}
	a.coreCmd = cmd
	log.Printf("[desktop] go-core started (pid %d)", cmd.Process.Pid)

	// Wait up to 5 s for /healthz to respond. If the subprocess dies (or never
	// binds), surface a real error instead of letting the frontend hit a
	// silent connection-refused.
	if err := waitForHealthz(5 * time.Second); err != nil {
		a.fatalDialog("go-core não respondeu",
			"O processo iniciou mas /healthz não respondeu em 5s.\n\nDetalhes: "+err.Error())
	}
}

// augmentedPATH returns the current PATH with Homebrew bin dirs prepended
// when they exist on disk. Needed because Finder-launched apps don't inherit
// the user's shell PATH.
func augmentedPATH() string {
	parts := []string{}
	for _, p := range []string{"/opt/homebrew/bin", "/usr/local/bin"} {
		if _, err := os.Stat(p); err == nil {
			parts = append(parts, p)
		}
	}
	if cur := os.Getenv("PATH"); cur != "" {
		parts = append(parts, cur)
	}
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ":"
		}
		out += p
	}
	return out
}

func waitForHealthz(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 300 * time.Millisecond}
	for time.Now().Before(deadline) {
		resp, err := client.Get("http://" + goCoreAddr + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("timeout aguardando /healthz")
}

func (a *App) fatalDialog(title, msg string) {
	log.Printf("[desktop] %s: %s", title, msg)
	if a.ctx == nil {
		return
	}
	_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.ErrorDialog,
		Title:   title,
		Message: msg,
	})
}

// goCoreExecutable returns the absolute path to the go-core binary.
//
// Search order:
//  1. Same directory as the running executable (bundled .app case:
//     Contents/MacOS/go-core sits next to Contents/MacOS/AIdentify).
//  2. $PATH lookup — useful when the developer builds the core manually
//     and adds it to PATH.
//  3. Relative path ../../core/go-core — convenient during `wails dev`
//     when both are built with `go build`.
func goCoreExecutable() (string, error) {
	// 1. Sibling of running executable.
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "go-core")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	// 2. $PATH.
	if path, err := exec.LookPath("go-core"); err == nil {
		return path, nil
	}

	// 3. Relative path from the wails dev working directory.
	rel := filepath.Join("..", "core", "go-core")
	if abs, err := filepath.Abs(rel); err == nil {
		if _, err := os.Stat(abs); err == nil {
			return abs, nil
		}
	}

	return "", os.ErrNotExist
}

// OpenFileDialog opens a native OS file picker and returns the chosen path.
// Returns an empty string if the user cancels.
func (a *App) OpenFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Abrir Imagem",
		Filters: []runtime.FileFilter{
			{DisplayName: "Imagens DICOM (*.dcm)", Pattern: "*.dcm"},
			{DisplayName: "Imagens (*.png;*.jpg;*.jpeg)", Pattern: "*.png;*.jpg;*.jpeg"},
			{DisplayName: "Todos os arquivos (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return ""
	}
	return path
}

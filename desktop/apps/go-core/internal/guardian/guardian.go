package guardian

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

type Supervisor struct {
	mu           sync.Mutex
	cmd          *exec.Cmd
	bin          string
	args         []string
	workDir      string
	healthURL    string
	backoff      time.Duration
	httpClient   *http.Client
	lastStartErr error
}

func New(bin string, args []string, workDir string, healthURL string, backoff time.Duration) *Supervisor {
	return &Supervisor{
		bin:       bin,
		args:      args,
		workDir:   workDir,
		healthURL: healthURL,
		backoff:   backoff,
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

func (s *Supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		return nil
	}

	cmd := exec.CommandContext(ctx, s.bin, s.args...)
	cmd.Dir = s.workDir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if err := cmd.Start(); err != nil {
		s.lastStartErr = err
		return fmt.Errorf("start sidecar: %w", err)
	}

	s.cmd = cmd
	go func(localCmd *exec.Cmd) {
		_ = localCmd.Wait()
	}(cmd)

	return nil
}

func (s *Supervisor) EnsureHealthy(ctx context.Context) error {
	if err := s.HealthCheck(); err == nil {
		return nil
	}

	if err := s.Restart(ctx); err != nil {
		return err
	}

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if err := s.HealthCheck(); err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	return errors.New("ai engine did not become healthy after restart")
}

func (s *Supervisor) HealthCheck() error {
	resp, err := s.httpClient.Get(s.healthURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("health check status: %d", resp.StatusCode)
}

func (s *Supervisor) Restart(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL)
		s.cmd = nil
	}
	time.Sleep(s.backoff)
	return s.Start(ctx)
}

func (s *Supervisor) LastStartError() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastStartErr
}

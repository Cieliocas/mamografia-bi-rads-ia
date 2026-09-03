package guardian

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type Supervisor struct {
	mu             sync.Mutex
	cmd            *exec.Cmd
	bin            string
	args           []string
	workDir        string
	healthURL      string
	backoff        time.Duration
	httpClient     *http.Client
	lastStartErr   error
	consecFails    int
	maxFails       int
	disabled       bool
	disabledReason string
	extraEnv       []string
	// modelLoaded mirrors the sidecar's own `model_loaded` flag, refreshed on
	// every health check. "Service is up" and "a real model answered" are
	// different facts: the sidecar stays up and healthy while serving synthetic
	// findings from its mock backend, and conflating the two lets a
	// demonstration show fabricated results as if they came from the model.
	modelLoaded bool
	// modelReason explains why no real model is loaded, as reported by the
	// sidecar. Empty when a model is loaded.
	modelReason string
}

// New creates a Supervisor. maxFails is the number of consecutive
// EnsureHealthy failures after which the Supervisor self-disables to avoid
// burning CPU on a sidecar that will never come up (e.g. missing Python).
// If maxFails <= 0, the Supervisor never auto-disables.
func New(bin string, args []string, workDir string, healthURL string, backoff time.Duration, maxFails int) *Supervisor {
	return &Supervisor{
		bin:       bin,
		args:      args,
		workDir:   workDir,
		healthURL: healthURL,
		backoff:   backoff,
		maxFails:  maxFails,
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// Disable marks the Supervisor as permanently off (no start, no watch).
// Used either by config (AI_ENGINE_DISABLED) or after maxFails restart attempts.
func (s *Supervisor) Disable(reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.disabled = true
	s.disabledReason = reason
}

// IsDisabled reports whether the AI sidecar is intentionally off.
func (s *Supervisor) IsDisabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.disabled
}

// DisabledReason returns the human-readable reason the Supervisor was
// disabled, or "" if it is active.
func (s *Supervisor) DisabledReason() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.disabledReason
}

func (s *Supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.disabled {
		return errors.New("ai sidecar disabled: " + s.disabledReason)
	}

	if s.cmd != nil && s.cmd.Process != nil && s.cmd.ProcessState == nil {
		return nil
	}
	s.cmd = nil

	cmd := exec.CommandContext(ctx, s.bin, s.args...)
	cmd.Dir = s.workDir
	if len(s.extraEnv) > 0 {
		cmd.Env = append(os.Environ(), s.extraEnv...)
	}
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

// SetEnv adds variables to the sidecar process environment, on top of the
// inherited one. Takes effect on the next (re)start, so the guardian's restart
// loop keeps the same configuration. Format: "KEY=value".
func (s *Supervisor) SetEnv(vars ...string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.extraEnv = append(s.extraEnv, vars...)
}

func (s *Supervisor) EnsureHealthy(ctx context.Context) error {
	if s.IsDisabled() {
		return errors.New("ai sidecar disabled: " + s.DisabledReason())
	}

	if err := s.HealthCheck(); err == nil {
		s.resetFailures()
		return nil
	}

	if err := s.Restart(ctx); err != nil {
		s.recordFailure(err)
		return err
	}

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if err := s.HealthCheck(); err == nil {
			s.resetFailures()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	err := errors.New("ai engine did not become healthy after restart")
	s.recordFailure(err)
	return err
}

func (s *Supervisor) resetFailures() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.consecFails = 0
}

func (s *Supervisor) recordFailure(cause error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.consecFails++
	if s.maxFails > 0 && s.consecFails >= s.maxFails && !s.disabled {
		s.disabled = true
		s.disabledReason = "auto-disabled after " + strconv.Itoa(s.consecFails) +
			" failed restart attempts: " + cause.Error()
	}
}

func (s *Supervisor) HealthCheck() error {
	resp, err := s.httpClient.Get(s.healthURL)
	if err != nil {
		s.setModelLoaded(false, "Serviço de IA não respondeu.")
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		s.setModelLoaded(false, fmt.Sprintf("Serviço de IA respondeu com status %d.", resp.StatusCode))
		return fmt.Errorf("health check status: %d", resp.StatusCode)
	}

	// The body carries {"status","uptime_sec","model_loaded"}. A body that does
	// not parse means the service answered but we cannot vouch for the model,
	// so treat the model as absent rather than assume it is there.
	var body struct {
		ModelLoaded bool   `json:"model_loaded"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&body); err != nil {
		s.setModelLoaded(false, "Resposta de saúde do serviço de IA ilegível.")
		return nil
	}
	s.setModelLoaded(body.ModelLoaded, body.Reason)
	return nil
}

func (s *Supervisor) setModelLoaded(v bool, reason string) {
	s.mu.Lock()
	s.modelLoaded = v
	if v {
		s.modelReason = ""
	} else {
		s.modelReason = reason
	}
	s.mu.Unlock()
}

// ModelReason explains why no real model is loaded. Empty when one is.
func (s *Supervisor) ModelReason() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.modelReason
}

// ModelLoaded reports whether the last health check saw real model weights
// loaded. False means the sidecar is answering from its mock backend — the
// findings are synthetic.
func (s *Supervisor) ModelLoaded() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.modelLoaded
}

func (s *Supervisor) Restart(ctx context.Context) error {
	s.mu.Lock()

	if s.cmd != nil && s.cmd.Process != nil {
		_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL)
		s.cmd = nil
	}
	s.mu.Unlock()

	time.Sleep(s.backoff)
	return s.Start(ctx)
}

func (s *Supervisor) LastStartError() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastStartErr
}

// Watch runs EnsureHealthy on a ticker until ctx is cancelled.
// Intended to be called as a goroutine from the composition root.
func (s *Supervisor) Watch(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if s.IsDisabled() {
				return
			}
			if err := s.EnsureHealthy(ctx); err != nil {
				// non-fatal: log from caller via EnsureHealthy
				_ = err
			}
		}
	}
}

package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Host              string
	Port              int
	AISidecarURL      string
	AISharedToken     string
	AISidecarExec     string
	AISidecarWorkDir  string
	AISidecarScript   string
	AISidecarPython   string
	SQLitePath        string
	LocalDataRoot     string
	GuardianBackoffMs int
	GuardianMaxFails  int
	AIEngineDisabled  bool
}

func Load() Config {
	home, _ := os.UserHomeDir()
	defaultDataRoot := filepath.Join(home, ".mammo-desktop")

	return Config{
		Host:              env("GO_CORE_HOST", "127.0.0.1"),
		Port:              envInt("GO_CORE_PORT", 8088),
		AISidecarURL:      env("AI_ENGINE_URL", "http://127.0.0.1:8090"),
		AISharedToken:     loadOrCreateToken(defaultDataRoot),
		AISidecarExec:     env("AI_ENGINE_EXEC", ""),
		AISidecarWorkDir:  env("AI_ENGINE_WORKDIR", ""),
		AISidecarScript:   env("AI_ENGINE_SCRIPT", "app/main.py"),
		AISidecarPython:   env("AI_ENGINE_PYTHON", "python3"),
		SQLitePath:        env("SQLITE_PATH", filepath.Join(defaultDataRoot, "mammo.db")),
		LocalDataRoot:     env("MAMMO_LOCAL_ROOT", defaultDataRoot),
		GuardianBackoffMs: envInt("AI_GUARDIAN_BACKOFF_MS", 2000),
		GuardianMaxFails:  envInt("AI_GUARDIAN_MAX_FAILS", 5),
		AIEngineDisabled:  envBool("AI_ENGINE_DISABLED", false),
	}
}

// loadOrCreateToken returns the shared secret used between go-core and the
// AI sidecar. Resolution order:
//  1. AI_SHARED_TOKEN environment variable (CI, Docker, explicit override)
//  2. Token file at <dataRoot>/.token (persisted across restarts)
//  3. Fresh 32-byte hex token generated and saved to disk on first run
//
// The token never appears as a hardcoded default in source code.
func loadOrCreateToken(dataRoot string) string {
	// 1. Explicit env var always wins.
	if t := os.Getenv("AI_SHARED_TOKEN"); t != "" {
		return t
	}

	tokenFile := filepath.Join(dataRoot, ".token")

	// 2. Read existing token from disk.
	if b, err := os.ReadFile(tokenFile); err == nil {
		if t := strings.TrimSpace(string(b)); t != "" {
			return t
		}
	}

	// 3. Generate a new cryptographically-random token and persist it.
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		// Extremely unlikely; fall through to a time-seeded value.
		panic(fmt.Sprintf("config: cannot generate secure token: %v", err))
	}
	token := hex.EncodeToString(raw)

	// Best-effort write: if the directory doesn't exist yet, try to create it.
	_ = os.MkdirAll(dataRoot, 0o700)
	// 0o600 → readable only by the owning user.
	if err := os.WriteFile(tokenFile, []byte(token+"\n"), 0o600); err != nil {
		// Write failed (e.g. read-only FS in tests). Token will be regenerated
		// on next start, but both processes share the same in-process value for
		// this run.
		fmt.Fprintf(os.Stderr, "config: warning: could not persist token: %v\n", err)
	}

	return token
}

func envBool(key string, fallback bool) bool {
	switch os.Getenv(key) {
	case "1", "true", "TRUE", "yes":
		return true
	case "0", "false", "FALSE", "no":
		return false
	}
	return fallback
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}

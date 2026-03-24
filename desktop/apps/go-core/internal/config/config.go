package config

import (
	"os"
	"path/filepath"
	"strconv"
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
}

func Load() Config {
	home, _ := os.UserHomeDir()
	defaultDataRoot := filepath.Join(home, ".mammo-desktop")

	return Config{
		Host:              env("GO_CORE_HOST", "127.0.0.1"),
		Port:              envInt("GO_CORE_PORT", 8088),
		AISidecarURL:      env("AI_ENGINE_URL", "http://127.0.0.1:8090"),
		AISharedToken:     env("AI_SHARED_TOKEN", "mammo-local-token"),
		AISidecarExec:     env("AI_ENGINE_EXEC", ""),
		AISidecarWorkDir:  env("AI_ENGINE_WORKDIR", ""),
		AISidecarScript:   env("AI_ENGINE_SCRIPT", "app/main.py"),
		AISidecarPython:   env("AI_ENGINE_PYTHON", "python3"),
		SQLitePath:        env("SQLITE_PATH", filepath.Join(defaultDataRoot, "mammo.db")),
		LocalDataRoot:     env("MAMMO_LOCAL_ROOT", defaultDataRoot),
		GuardianBackoffMs: envInt("AI_GUARDIAN_BACKOFF_MS", 2000),
	}
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

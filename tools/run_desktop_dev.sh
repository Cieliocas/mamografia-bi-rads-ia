#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_DIR="$ROOT_DIR/apps/core"
AI_DIR="$ROOT_DIR/apps/ai-engine"
UI_DIR="$ROOT_DIR/desktop/apps/ui"
UI_FRONTEND_DIR="$UI_DIR/frontend"
LOCK_DIR="/tmp/mammo-desktop-dev.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
GOCACHE_DIR="${GOCACHE_DIR:-/tmp/go-build-cache}"

REBUILD_GO=0
INSTALL_UI_DEPS=0
INSTALL_AI_DEPS=0

for arg in "$@"; do
  case "$arg" in
    --rebuild-go)
      REBUILD_GO=1
      ;;
    --install-ui-deps)
      INSTALL_UI_DEPS=1
      ;;
    --install-ai-deps)
      INSTALL_AI_DEPS=1
      ;;
    *)
      echo "[desktop] opcao desconhecida: $arg"
      echo "uso: $0 [--rebuild-go] [--install-ui-deps] [--install-ai-deps]"
      exit 1
      ;;
  esac
done

log() {
  echo "[desktop] $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[desktop] comando obrigatorio nao encontrado: $1"
    exit 1
  fi
}

require_cmd go
require_cmd python3
require_cmd npm

WAILS_BIN="${WAILS_BIN:-}"
if [[ -z "$WAILS_BIN" ]]; then
  if command -v wails >/dev/null 2>&1; then
    WAILS_BIN="$(command -v wails)"
  elif [[ -x "$(go env GOPATH)/bin/wails" ]]; then
    WAILS_BIN="$(go env GOPATH)/bin/wails"
  else
    echo "[desktop] wails nao encontrado no PATH."
    echo "[desktop] instale com: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
    exit 1
  fi
fi

log "projeto: $ROOT_DIR"
mkdir -p "$GOCACHE_DIR"
export GOCACHE="$GOCACHE_DIR"

if mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$$" > "$LOCK_PID_FILE"
  trap 'rm -f "$LOCK_PID_FILE"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
else
  if [[ -f "$LOCK_PID_FILE" ]]; then
    LOCK_PID="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${LOCK_PID:-}" ]] && kill -0 "$LOCK_PID" >/dev/null 2>&1; then
      echo "[desktop] app ja esta em execucao (PID $LOCK_PID)."
      echo "[desktop] feche a instancia atual antes de abrir outra."
      exit 1
    fi
  fi

  log "lock antigo encontrado; limpando lock stale..."
  rm -f "$LOCK_PID_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  mkdir -p "$LOCK_DIR"
  echo "$$" > "$LOCK_PID_FILE"
  trap 'rm -f "$LOCK_PID_FILE"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
fi

mkdir -p "$GO_DIR/bin"
if [[ ! -x "$GO_DIR/bin/core" || "$REBUILD_GO" -eq 1 ]]; then
  log "compilando core..."
  (
    cd "$GO_DIR"
    go mod tidy
    go build -o bin/core ./cmd/orchestrator
  )
fi

if [[ ! -d "$AI_DIR/.venv" ]]; then
  log "criando virtualenv do sidecar..."
  (
    cd "$AI_DIR"
    python3 -m venv .venv
  )
  INSTALL_AI_DEPS=1
fi

AI_PY="$AI_DIR/.venv/bin/python"
AI_PIP="$AI_DIR/.venv/bin/pip"

if [[ ! -x "$AI_PY" ]]; then
  echo "[desktop] python do sidecar nao encontrado em $AI_PY"
  exit 1
fi

if [[ "$INSTALL_AI_DEPS" -eq 1 || ! -f "$AI_DIR/.venv/.deps_ok" ]]; then
  log "instalando dependencias do sidecar..."
  "$AI_PIP" install --upgrade pip
  "$AI_PIP" install -r "$AI_DIR/requirements.txt"
  touch "$AI_DIR/.venv/.deps_ok"
fi

if [[ "$INSTALL_UI_DEPS" -eq 1 || ! -d "$UI_FRONTEND_DIR/node_modules" ]]; then
  log "instalando dependencias da UI..."
  npm --prefix "$UI_FRONTEND_DIR" install
fi

log "iniciando app desktop..."
cd "$UI_DIR"
AI_ENGINE_PYTHON="$AI_PY" "$WAILS_BIN" dev -s

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GO_DIR="$ROOT_DIR/desktop/apps/go-core"
AI_DIR="$ROOT_DIR/desktop/apps/ai-engine"
UI_DIR="$ROOT_DIR/desktop/apps/ui"

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

log "projeto: $ROOT_DIR"

mkdir -p "$GO_DIR/bin"
if [[ ! -x "$GO_DIR/bin/go-core" || "$REBUILD_GO" -eq 1 ]]; then
  log "compilando go-core..."
  (
    cd "$GO_DIR"
    go mod tidy
    go build -o bin/go-core ./cmd/orchestrator
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

if [[ "$INSTALL_UI_DEPS" -eq 1 || ! -d "$UI_DIR/node_modules" ]]; then
  log "instalando dependencias da UI..."
  (
    cd "$UI_DIR"
    npm install
  )
fi

log "iniciando app desktop..."
cd "$UI_DIR"
AI_ENGINE_PYTHON="$AI_PY" npm run dev

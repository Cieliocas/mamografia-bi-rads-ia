#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# run_demo.sh — abre o AIdentify empacotado COM a IA real (spec 006)
#
# O .app gerado por build_release.sh não empacota o serviço Python nem os
# modelos. Sozinho, ele sobe sem IA — corretamente sinalizado na interface, mas
# inútil para demonstrar a inferência.
#
# Este script abre o mesmo .app apontando o serviço de inferência para o
# repositório, de modo que a demonstração use o aplicativo empacotado, e não o
# modo de desenvolvimento.
#
# Uso:  bash tools/run_demo.sh
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/desktop/build/bin/AIdentify.app/Contents/MacOS/AIdentify"

if [ ! -x "$APP" ]; then
  echo "AIdentify.app não encontrado. Gere com:  bash tools/build_release.sh arm64" >&2
  exit 1
fi

# Verificação prévia — não abrir uma demonstração que vai rodar em modo simulado.
if ! bash "$ROOT/tools/check_demo.sh"; then
  echo
  echo "Abortado: resolva as pendências acima antes de demonstrar." >&2
  exit 1
fi

pkill -f "AIdentify.app/Contents/MacOS" >/dev/null 2>&1 || true
pkill -f "MacOS/go-core"                >/dev/null 2>&1 || true
pkill -f "uvicorn app.main"             >/dev/null 2>&1 || true
sleep 1

echo
echo "▸ Abrindo AIdentify com a cascata real…"
AI_ENGINE_WORKDIR="$ROOT/apps/ai-engine" \
AI_ENGINE_PYTHON="$ROOT/apps/ai-engine/.venv/bin/python" \
  "$APP" >/dev/null 2>&1 &

for _ in $(seq 1 60); do
  estado=$(curl -s -m 1 http://127.0.0.1:8088/readyz 2>/dev/null \
           | sed -n 's/.*"ai_model":"\([a-z]*\)".*/\1/p')
  case "$estado" in
    real)      echo "▸ Pronto — ai_model: real. Pode demonstrar."; exit 0 ;;
    simulated) echo "▸ ATENÇÃO: subiu em MODO SIMULADO. Não demonstre a IA." >&2; exit 1 ;;
  esac
  sleep 1
done
echo "▸ O serviço de IA não ficou pronto a tempo. Confira a barra de estado." >&2
exit 1

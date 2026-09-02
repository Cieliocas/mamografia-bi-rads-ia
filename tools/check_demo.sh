#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# check_demo.sh — verificação prévia de demonstração (spec 006, T3)
#
# Roda ANTES de qualquer demonstração. Confere que a aplicação vai subir com os
# modelos reais carregados, em vez de cair silenciosamente para o modo simulado
# e apresentar achados sintéticos a um profissional.
#
# Uso:  bash tools/check_demo.sh
# Saída: 0 se pronto para demonstrar, 1 caso contrário.
# ────────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_DIR="$ROOT/apps/ai-engine"
FALHAS=0

ok()    { printf "  \033[32m✓\033[0m %s\n" "$1"; }
falha() { printf "  \033[31m✗\033[0m %s\n" "$1"; [ $# -gt 1 ] && printf "      → %s\n" "$2"; FALHAS=$((FALHAS+1)); }
aviso() { printf "  \033[33m!\033[0m %s\n" "$1"; }

echo "── Verificação de demonstração — AIdentify ──────────────────────────"
echo

# ── 1. Ferramentas ──────────────────────────────────────────────────────────
echo "Ferramentas"
for t in go node npm; do
  command -v "$t" >/dev/null 2>&1 && ok "$t: $(command -v $t)" || falha "$t não encontrado"
done
if command -v wails >/dev/null 2>&1; then ok "wails: $(wails version 2>/dev/null | head -1)"
else aviso "wails ausente — só afeta o build do app nativo"; fi
echo

# ── 2. Serviço de inferência ────────────────────────────────────────────────
echo "Serviço de inferência"
PY="$AI_DIR/.venv/bin/python"
if [ -x "$PY" ]; then
  ok "venv: $("$PY" --version 2>&1)"
  if "$PY" -c "import onnxruntime" 2>/dev/null; then
    ok "onnxruntime $("$PY" -c 'import onnxruntime;print(onnxruntime.__version__)' 2>/dev/null)"
  else
    falha "onnxruntime não instalado na venv" "cd apps/ai-engine && .venv/bin/pip install -r requirements.txt"
  fi
  for m in pydicom cv2; do
    "$PY" -c "import $m" 2>/dev/null && ok "$m" || falha "$m ausente" "cd apps/ai-engine && .venv/bin/pip install -r requirements.txt"
  done
  if "$PY" -c "import pydicom, pylibjpeg" 2>/dev/null; then ok "codecs de DICOM comprimido"
  else falha "plugins de descompressão ausentes" "sem eles, DICOM JPEG-LS não decodifica"; fi
else
  falha "venv não encontrada em apps/ai-engine/.venv" "python3 -m venv apps/ai-engine/.venv && apps/ai-engine/.venv/bin/pip install -r apps/ai-engine/requirements.txt"
fi
echo

# ── 3. Modelos — o item que decide real × simulado ──────────────────────────
echo "Modelos de IA"
MODELS="$AI_DIR/models"
for m in classifier_hybrid.onnx detector_yolo.onnx; do
  if [ -f "$MODELS/$m" ]; then
    ok "$m ($(du -h "$MODELS/$m" | cut -f1))"
  else
    falha "$m AUSENTE" "sem ele a aplicação roda em MODO SIMULADO, com achados sintéticos"
  fi
done
if [ -f "$MODELS/CHECKSUMS.txt" ] && [ -f "$MODELS/classifier_hybrid.onnx" ]; then
  if (cd "$MODELS" && shasum -a 256 -c CHECKSUMS.txt >/dev/null 2>&1); then
    ok "checksums conferem"
  else
    falha "checksum divergente" "os artefatos não são os que foram avaliados"
  fi
fi
echo

# ── 4. Go Core ──────────────────────────────────────────────────────────────
echo "Go Core"
[ -x "$ROOT/apps/core/bin/core" ] && ok "binário compilado" \
  || aviso "binário ausente — será compilado no arranque (cd apps/core && go build -o bin/core ./cmd/server)"
[ -d "$ROOT/apps/frontend/node_modules" ] && ok "dependências do frontend" \
  || falha "node_modules ausente" "npm --prefix apps/frontend install"
echo

# ── 5. Estado em execução, se houver ────────────────────────────────────────
if curl -s -m 2 http://127.0.0.1:8088/readyz >/dev/null 2>&1; then
  echo "Aplicação em execução"
  R=$(curl -s -m 2 http://127.0.0.1:8088/readyz)
  case "$(printf '%s' "$R" | sed -n 's/.*"ai_model":"\([a-z]*\)".*/\1/p')" in
    real)      ok "ai_model: real — os achados vêm dos modelos" ;;
    simulated) falha "ai_model: SIMULADO" "a aplicação está servindo achados sintéticos AGORA" ;;
    *)         aviso "ai_model: none — serviço de IA fora do ar" ;;
  esac
  echo
fi

# ── Veredito ────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────────────────────────────"
if [ "$FALHAS" -eq 0 ]; then
  printf "\033[32mPRONTO PARA DEMONSTRAR\033[0m — os modelos reais serão carregados.\n"
  echo
  echo "Iniciar com:  bash tools/run_desktop_dev.sh"
  exit 0
fi
printf "\033[31m%d VERIFICAÇÃO(ÕES) FALHARAM\033[0m — resolva antes de demonstrar.\n" "$FALHAS"
echo
echo "Demonstrar com qualquer uma delas pendente arrisca exibir achados"
echo "sintéticos a um profissional como se fossem saída dos modelos."
exit 1

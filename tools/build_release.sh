#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# build_release.sh — builds a self-contained AIdentify.app for macOS
#
# Usage:
#   tools/build_release.sh [arm64|amd64|universal]   (default: arm64)
#
# What it does:
#   1. Builds the Angular frontend → apps/desktop/dist/
#   2. Compiles the Go Core sidecar → apps/core/go-core
#   3. Runs `wails build` which embeds dist/ into the Wails binary
#   4. Copies go-core into AIdentify.app/Contents/MacOS/ so the Wails binary
#      can launch it as a subprocess on startup
#   5. Ad-hoc code-signs the entire .app (no Apple Developer ID required)
#   6. Prints the install instructions
#
# Dependencies: wails ≥ 2.8, Go ≥ 1.22, Node ≥ 22 / npm
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 0. Parse platform ────────────────────────────────────────────────────────
ARCH="${1:-arm64}"
case "$ARCH" in
  arm64)     GOARCH="arm64"; WAILS_PLATFORM="darwin/arm64" ;;
  amd64)     GOARCH="amd64"; WAILS_PLATFORM="darwin/amd64" ;;
  universal) GOARCH="";      WAILS_PLATFORM="darwin/universal" ;;
  *)
    echo "Usage: $0 [arm64|amd64|universal]" >&2
    exit 1
    ;;
esac

log() { echo "▸ $*"; }

# ── 1. Check required tools ──────────────────────────────────────────────────
for tool in wails go node npm; do
  if ! command -v "$tool" &>/dev/null; then
    echo "Error: '$tool' not found in PATH." >&2
    exit 1
  fi
done

# ── 2. Build Angular frontend ────────────────────────────────────────────────
log "Building Angular frontend…"
cd "$ROOT/apps/frontend"
npm install --legacy-peer-deps --silent
npm run build -- --configuration production
# Copy output to the desktop embed directory
rm -rf "$ROOT/apps/desktop/dist"
cp -R dist "$ROOT/apps/desktop/dist"
touch "$ROOT/apps/desktop/dist/.gitkeep"
log "Frontend built → apps/desktop/dist/"

# ── 3. Compile Go Core sidecar ───────────────────────────────────────────────
log "Compiling Go Core sidecar (GOOS=darwin GOARCH=${GOARCH:-arm64+amd64})…"
CORE_SRC="$ROOT/apps/core"
CORE_BIN="$CORE_SRC/go-core"

if [ "$ARCH" = "universal" ]; then
  # Build arm64 + amd64 and lipo them together
  CORE_ARM="$CORE_SRC/go-core-arm64"
  CORE_AMD="$CORE_SRC/go-core-amd64"
  GOOS=darwin GOARCH=arm64 go build -o "$CORE_ARM" ./cmd/server
  GOOS=darwin GOARCH=amd64 go build -o "$CORE_AMD" ./cmd/server
  lipo -create -output "$CORE_BIN" "$CORE_ARM" "$CORE_AMD"
  rm -f "$CORE_ARM" "$CORE_AMD"
else
  GOOS=darwin GOARCH="$GOARCH" go build -C "$CORE_SRC" -o "$CORE_BIN" ./cmd/server
fi
log "Go Core compiled → apps/core/go-core"

# ── 4. Wails build ───────────────────────────────────────────────────────────
log "Running wails build -platform $WAILS_PLATFORM…"
cd "$ROOT/apps/desktop"
# Skip the frontend build step in wails.json — we already built it above.
wails build -clean -platform "$WAILS_PLATFORM" -s

APP="$ROOT/apps/desktop/build/bin/AIdentify.app"
if [ ! -d "$APP" ]; then
  echo "Build failed: AIdentify.app not found at $APP" >&2
  exit 1
fi

# ── 5. Bundle Go Core into the .app ─────────────────────────────────────────
log "Bundling go-core into Contents/MacOS/…"
MACOS_DIR="$APP/Contents/MacOS"
cp "$CORE_BIN" "$MACOS_DIR/go-core"
chmod +x "$MACOS_DIR/go-core"

# ── 6. Ad-hoc code sign ──────────────────────────────────────────────────────
log "Ad-hoc code signing…"
# Sign inner binaries first, then the bundle.
codesign --force --deep --sign - "$APP"
log "Signed."

# ── 7. Done ──────────────────────────────────────────────────────────────────
SIZE="$(du -sh "$APP" | cut -f1)"
echo
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  AIdentify.app  ($ARCH, $SIZE)                                  "
echo "║  → apps/desktop/build/bin/AIdentify.app                         "
echo "╚══════════════════════════════════════════════════════════════════╝"
echo
echo "Para instalar:"
echo "  cp -R '$APP' /Applications/"
echo "  # Primeiro lançamento: clique direito → Abrir (Gatekeeper)"
echo
echo "Para distribuir ao radiologista:"
echo "  Compacte o .app em zip: zip -r AIdentify-v0.2.0-$ARCH.zip '$APP'"

#!/bin/sh
# Build a distributable AIdentify.app for macOS.
#
# Usage:
#   tools/build_release.sh                # arm64 (default, faster)
#   tools/build_release.sh universal      # arm64 + amd64 (larger, runs everywhere)
#
# The resulting .app is at apps/desktop/build/bin/AIdentify.app and can be
# copied to /Applications. Wails self-signs ad-hoc, so on first launch the
# user must right-click → Open to bypass Gatekeeper.
#
# AI sidecar: this build does not bundle Python or any model. The app launches
# in "AI disabled" mode automatically when no .venv is present next to the
# binary; the radiologist can still open DICOMs, annotate and export.

set -e

cd "$(dirname "$0")/.."

PLATFORM="${1:-darwin/arm64}"
case "$PLATFORM" in
  arm64)     PLATFORM="darwin/arm64" ;;
  amd64)     PLATFORM="darwin/amd64" ;;
  universal) PLATFORM="darwin/universal" ;;
esac

cd apps/desktop
echo "Building AIdentify.app for $PLATFORM..."
wails build -clean -platform "$PLATFORM"

APP="build/bin/AIdentify.app"
if [ ! -d "$APP" ]; then
  echo "Build failed: $APP not found" >&2
  exit 1
fi

echo
echo "Built $(du -sh "$APP" | cut -f1) -> apps/desktop/$APP"
echo
echo "To install:"
echo "  1. cp -R apps/desktop/$APP /Applications/"
echo "  2. First launch: right-click → Open (Gatekeeper, ad-hoc signed)"

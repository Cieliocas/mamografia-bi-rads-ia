#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="Mammo BI-RADS Desktop Dev.app"
APP_DIR="$ROOT_DIR/$APP_NAME"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

RUN_SCRIPT="$ROOT_DIR/desktop/tools/run_desktop_dev.sh"

if [[ ! -x "$RUN_SCRIPT" ]]; then
  echo "[desktop] execute antes: chmod +x desktop/tools/run_desktop_dev.sh"
  exit 1
fi

mkdir -p "$MACOS_DIR"

cat > "$CONTENTS_DIR/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Mammo BI-RADS Desktop Dev</string>
  <key>CFBundleDisplayName</key>
  <string>Mammo BI-RADS Desktop Dev</string>
  <key>CFBundleIdentifier</key>
  <string>br.ufpi.mammo.desktop.devlauncher</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
</dict>
</plist>
EOF

cat > "$MACOS_DIR/launcher" <<EOF
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$ROOT_DIR"
RUN_SCRIPT="$RUN_SCRIPT"

if [[ ! -x "\$RUN_SCRIPT" ]]; then
  /usr/bin/osascript -e 'display dialog "Nao foi possivel localizar o script de inicializacao do app." buttons {"OK"} default button "OK"'
  exit 1
fi

/usr/bin/osascript <<OSA
set runCommand to "cd " & quoted form of "$ROOT_DIR" & "; " & quoted form of "$RUN_SCRIPT"
tell application "Terminal"
  activate
  do script runCommand
end tell
OSA
EOF

chmod +x "$MACOS_DIR/launcher"

echo "[desktop] app criado em:"
echo "$APP_DIR"
echo
echo "[desktop] voce pode abrir com duplo clique no Finder."

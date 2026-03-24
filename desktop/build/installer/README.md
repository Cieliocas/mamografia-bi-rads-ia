# Installer Build Flow (Offline/Air-gapped)

## Windows (.exe via NSIS + electron-builder)
1. Build UI (Nextron): `npm run build` in `apps/ui`.
2. Build Go: `CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o apps/go-core/bin/go-core.exe ./cmd/orchestrator`.
3. Freeze Python sidecar (PyInstaller): generate `apps/ai-engine/dist/ai-engine.exe`.
4. Bundle with electron-builder using `build/electron-builder.yml`.
5. NSIS workflow includes:
- EULA acceptance (mandatory).
- Installation folder selection.
- Disk space validation (>= 10 GB).
- GPU check script (`apps/ui/scripts/gpu-check.js`) to set CUDA/CPU mode.

## Linux (.deb)
1. Build Linux binaries (`go-core`, sidecar binary).
2. Run electron-builder for `deb` target.
3. Optional: use `fpm` for custom metadata/signing:
   `fpm -s dir -t deb -n mammo-desktop -v 0.1.0 --prefix /opt/mammo-desktop ./dist/linux-unpacked/=/opt/mammo-desktop`

## First Boot Runtime
1. Electron splash opens.
2. Go Core starts and initializes SQLite + local directories.
3. Go Guardian starts AI sidecar and polls `/health`.
4. Frontend polls `GET /startup/status`; only unlocks workstation when ready.

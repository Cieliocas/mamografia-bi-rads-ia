# Installer Build Flow (Wails)

Este diretorio documenta o fluxo de empacotamento desktop apos migracao para Wails.

## Status atual

- Electron/Nextron e `electron-builder` nao sao mais o caminho principal.
- O empacotamento deve seguir o fluxo do Wails (`wails build`).

## Build de desenvolvimento

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
aidentify_app="/Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia/aidentify.app"
bash desktop/tools/create_macos_app.sh
```

## Build nativo (release)

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia/desktop/apps/ui
wails build
```

Saida esperada:
- `desktop/apps/ui/build/bin/`

## First Boot Runtime esperado

1. Launcher inicia fluxo integrado.
2. Go Core sobe e valida dependencias locais.
3. Guardian sobe o AI sidecar e checa `/health`.
4. Splash da UI exibe progresso inicial.
5. Splash fecha automaticamente e abre interface principal.

## Pendencias

- Definir pipeline oficial de assinatura/notarizacao macOS.
- Definir empacotamento release para Windows/Linux com Wails.

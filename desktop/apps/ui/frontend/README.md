# Frontend (Angular)

Frontend da interface desktop AIdentify.

## Contexto

Este frontend e carregado pelo Wails (`desktop/apps/ui`) e nao deve ser tratado como app web isolada em producao.

## Scripts

```bash
npm start   # ng serve (dev)
npm run build
npm test
```

## Execucao recomendada no projeto

Use o script integrado na raiz do projeto:

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

Esse fluxo sobe frontend + shell desktop + go-core + ai-sidecar.

## Estrutura

- `src/app/app.ts`: estado e logica do viewer
- `src/app/app.html`: layout principal + splash
- `src/styles.css`: tokens visuais e estilos globais

## Observacao

Se houver divergencia entre `app.ts` e `app.html`, a UI pode travar no splash ou nao renderizar corretamente. Sempre validar os dois arquivos juntos.

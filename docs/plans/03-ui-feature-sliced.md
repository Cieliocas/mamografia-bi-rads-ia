# Plano 03 — UI Feature-Sliced

> **Pré-requisito:** Plano 02 concluído (`apps/frontend/` separado do shell Wails).

## Objetivo

Decompor o componente monolítico `app.ts` (689 linhas, 7 responsabilidades) em serviços
injetáveis e componentes standalone focados, seguindo a estrutura feature-sliced
já criada em `apps/frontend/src/app/`.

## Estado atual

```
apps/frontend/src/app/
├── app.ts          # 689 linhas: tipos, estado, canvas, mouse, UI
├── app.html        # 167 linhas: splash, sidebar, canvas, painel, modal
└── app.css
```

## Estado alvo

```
apps/frontend/src/app/
├── shared/
│   ├── models/
│   │   └── types.ts              # BiRads, ROI, RulerLine, VP, Ix, mkVP, helpers
│   └── components/
│       ├── splash/
│       │   ├── splash.component.ts
│       │   └── splash.component.html
│       └── confirm-modal/
│           ├── confirm-modal.component.ts
│           └── confirm-modal.component.html
├── core/
│   └── services/
│       ├── viewer-state.service.ts   # Estado do viewport + ferramentas + ROI
│       └── study.service.ts          # Carregamento de ficheiros + histórico
├── features/
│   ├── viewer/
│   │   ├── viewer.component.ts       # Canvas + draw + mouse events + wheel
│   │   └── viewer.component.html
│   └── annotations/
│       ├── findings-panel.component.ts
│       └── findings-panel.component.html
├── app.ts          # ~80 linhas: orquestrador + layout skeleton + keyboard
├── app.html        # ~60 linhas: slots para os componentes filhos
└── app.css
```

## Responsabilidades por arquivo

| Arquivo | O que guarda |
|---|---|
| `shared/models/types.ts` | Tipos puros: `BiRads`, `ROI`, `RulerLine`, `VP`, `IxMode`, `Ix`, `Snapshot`, `mkVP()`, `clone()`, `d2()` |
| `core/services/viewer-state.service.ts` | `vp[]`, `activeVp`, `splitMode`, `activeTool`, `activeShape`, `ix`, `selectedROI`, `clipboard`; métodos: zoom, pan, undo/redo, ROI management |
| `core/services/study.service.ts` | `historyFiles`, `openFileDialog()`, `onFileSelected()`, `loadHistory()` |
| `features/viewer/viewer.component.ts` | `@ViewChild` canvas refs, `draw()`, `drawROIs()`, `drawRulers()`, `onMouseDown/Move/Up`, wheel, coordinate transforms, hit testing |
| `features/annotations/findings-panel.component.ts` | Lista de ROIs, chips BI-RADS, edição inline |
| `shared/components/splash/` | Progresso de boot, failsafe timeout |
| `shared/components/confirm-modal/` | Modal de confirmação genérico |
| `app.ts` | Layout, keyboard shortcuts globais, `@HostListener keydown`, wiring entre componentes |

## Passos (cada um é um commit com `ng build` passando)

### Passo 1 — Extrair tipos para `shared/models/types.ts`
- Mover `BiRads`, `ROI`, `RulerLine`, `Snapshot`, `VP`, `IxMode`, `Ix`, `mkVP()`, `clone()`, `d2()` para o novo arquivo.
- Atualizar imports em `app.ts`.
- **Critério:** `ng build` passa sem erros.

### Passo 2 — Criar `ViewerStateService`
- `providedIn: 'root'`, guarda todo o estado mutável do viewport e ferramentas.
- Expõe getters/métodos para: `zoom`, `pan`, `undo`, `redo`, `selectROI`, `deselectROI`, `updateROI`, `setBirads`, `copyROI`, `pasteROI`, `clearAll`, `snap`, `setTool`, `toggleSplit`, etc.
- `app.ts` injeta o serviço e delega para ele.
- **Critério:** `ng build` passa; comportamento idêntico ao antes.

### Passo 3 — Criar `StudyService`
- Guarda `historyFiles[]`, encapsula `FileReader` logic.
- `app.ts` injeta e chama `openFile(vpIdx)`.
- **Critério:** `ng build` passa; carregar imagem continua funcionando.

### Passo 4 — Criar `ViewerComponent`
- Template próprio com `#c0`, `#ct0` (e opcionalmente `#c1`, `#ct1` para split).
- Toda a lógica de canvas: `draw()`, `drawROIs()`, `drawRulers()`, `i2s()`, `s2i()`, hit testing.
- Mouse events `(mousedown)`, `(mousemove)`, `(mouseup)` declarados no template do `ViewerComponent`.
- `@HostListener('window:wheel')` permanece no viewer (só afeta o canvas).
- Injetar `ViewerStateService` e `StudyService`.
- **Critério:** `ng build` passa; desenho e interação no canvas funcionam.

### Passo 5 — Criar `FindingsPanelComponent`
- Lista de ROIs com chips BI-RADS e edição inline de label/notes.
- Injetar `ViewerStateService`.
- Substituir o `<aside>` direito no `app.html`.
- **Critério:** `ng build` passa; painel direito renderiza ROIs corretamente.

### Passo 6 — Criar `SplashComponent` + `ConfirmModalComponent`
- `SplashComponent`: auto-gerencia o timer e emite `(done)` ao terminar.
- `ConfirmModalComponent`: `@Input message`, `@Output confirmed`.
- `app.ts` usa `(done)` e `(confirmed)` para atualizar `showSplash` e executar ação.
- **Critério:** `ng build` passa; splash aparece e fecha; modal funciona.

### Passo 7 — Enxugar `app.ts` + `app.html`
- `app.ts` fica com ~80 linhas: layout, keyboard shortcuts, wiring de events.
- `app.html` fica com ~60 linhas: `<app-splash>`, `<app-viewer>`, `<app-findings-panel>`, `<app-confirm-modal>`.
- Remover `.gitkeep` das pastas (substituídos por arquivos reais).
- **Critério:** `ng build` passa; `app.ts` ≤ 100 linhas.

## Riscos

| Risco | Mitigação |
|---|---|
| `@ViewChild` deve estar no componente que declara o template | `ViewerComponent` declara o canvas em seu próprio template |
| `@HostListener wheel` precisa de `passive: false` para `preventDefault()` | Usar `{ passive: false }` no listener do viewer |
| Services com `providedIn: 'root'` são singleton — estado compartilhado por natureza | OK para esta SPA; não há instâncias paralelas |
| Quebrar binding de eventos de teclado globais | `@HostListener keydown` permanece no `AppComponent` |

## Critérios de aceitação

- [ ] `ng build` passa sem warnings de erro.
- [ ] `app.ts` ≤ 100 linhas.
- [ ] Canvas renderiza imagens; ROIs, réguas e undo/redo funcionam.
- [ ] Splash abre e fecha corretamente.
- [ ] Painel direito lista ROIs com chips BI-RADS.
- [ ] Sem `import` de `canvas`, `MouseEvent` ou `draw` em `app.ts`.

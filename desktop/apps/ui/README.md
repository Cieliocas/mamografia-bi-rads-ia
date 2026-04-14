# AIdentify Desktop — UI Module

![Stack](https://img.shields.io/badge/runtime-Wails%20%2B%20Go-00ADD8?logo=go)
![Frontend](https://img.shields.io/badge/frontend-Angular%2018-DD0031?logo=angular)
![Styling](https://img.shields.io/badge/styling-Tailwind%20CSS-38BDF8?logo=tailwindcss)
![Mode](https://img.shields.io/badge/mode-Dark%20%7C%20Clinical-000000)

Módulo de interface desktop do **AIdentify**, construído com stack nativa de alto desempenho para ambientes de radiologia médica.

---

## Arquitetura

```
desktop/apps/ui/
├── main.go          # Ponto de entrada Wails
├── app.go           # Bindings Go → Angular (funções expostas ao frontend)
├── wails.json       # Configuração do Wails CLI
└── frontend/        # Projeto Angular 18 (TypeScript)
    ├── src/
    │   ├── app/
    │   │   ├── app.ts        # Componente raiz (lógica do viewer)
    │   │   ├── app.html      # Template com todos os painéis
    │   │   ├── app.config.ts # Providers globais (ícones Lucide)
    │   │   └── app.css
    │   ├── styles.css        # Tailwind CSS + custom tokens
    │   ├── index.html
    │   └── main.ts
    ├── tailwind.config.js    # Design system clínico (paleta "Clinical Obsidian")
    └── angular.json
```

---

## Stack Tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| Shell nativo | [Wails v2](https://wails.io) + Go 1.22+ | Container nativo, bindings Go↔Angular, WebView OS |
| Frontend | Angular 18 Standalone | Framework declarativo MVC, sem NgModules |
| Estilização | Tailwind CSS 3 | Design system Dark Mode clínico |
| Ícones | `lucide-angular` | Ícones médicos/clínicos SVG inline |
| Visualizador | Canvas 2D API (nativo) | Renderização de imagens com zoom/pan/filtros |

> **Por que Wails e não Electron?**  
> O Wails usa a WebView nativa do sistema (WebKit no macOS, WebView2 no Windows) sem embutir Node.js ou Chromium. Resultado: binário de ~8 MB, uso de RAM ~40× menor — fundamental num contexto em que a memória precisa estar livre para processar imagens médicas de alta resolução.

---

## Design System — "Clinical Obsidian"

Paleta otimizada para salas de laudo: fundo escuro de alto contraste, acentos de cor para achados críticos.

| Token | Hex | Uso |
|---|---|---|
| `surface-dim` | `#0E0E0E` | Fundo geral (obsidiana) |
| `surface-container-high` | `#201F1F` | Painéis laterais |
| `primary` | `#AFA2FF` | Ações primárias, bordas ativas |
| `secondary` | `#00E3FD` | Acentos cyan, medições |
| `error` | `#FF6E84` | Marcadores de achados críticos |
| `on-surface-variant` | `#ADAAAA` | Textos secundários |

---

## Funcionalidades Implementadas

### Viewer de Imagens (Canvas 2D)
- ✅ Carregamento de imagens via seletor de arquivo (`image/*`, `.dcm`)
- ✅ Zoom in/out com botões e scroll do mouse
- ✅ Pan (arrastar) com ferramenta Hand
- ✅ Fit-to-screen automático ao carregar
- ✅ Ajuste de contraste e brilho em tempo real (filtros CSS canvas)

### Ferramentas de Anotação
- ✅ Ferramenta Marker — coloca marcadores circulares na imagem (Mass/Finding)
- ✅ Ferramenta Ruler — mede distâncias em pixels com linha dashed e label
- ✅ Painel de findings com lista dinâmica + opção de remover individualmente
- ✅ Botão para limpar todas as anotações

### Navegação por Painéis (Sidebar)
| Painel | Descrição |
|---|---|
| **Images** | Lista de exames ativos, card do arquivo carregado, fila de slots |
| **History** | Histórico de arquivos abertos na sessão com thumbnail e data |
| **Analysis** | Métricas da imagem carregada: dimensões, zoom, contraste, nº de achados |
| **Tools** | Paleta de ferramentas em grid: navegação, anotação, sliders de ajuste |

### Splash Screen
- ✅ Tela de inicialização com progresso animado (Angular `ngOnInit` timer)
- ✅ Design "Clinical Obsidian" com gradiente violet/cyan

---

## Desenvolvimento

### Pré-requisitos

```bash
# Go 1.22+
go version

# Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Node.js 20+ / npm 10+
node -v && npm -v
```

### Iniciar em modo dev (hot-reload)

```bash
cd desktop/apps/ui
wails dev
```

Fluxo recomendado no monorepo (UI + Go Core + AI sidecar):

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

O Wails inicializa o servidor Angular (`ng serve`) automaticamente na porta `:4200` e abre a janela nativa da aplicação. Qualquer alteração nos arquivos `.ts` / `.html` / `.css` do frontend é refletida em tempo real.

### Acessar via browser (debug)

```
http://localhost:34115   # Wails dev server (bindings Go disponíveis)
http://localhost:4200    # Angular dev server (sem bindings Go)
```

### Build de produção

```bash
cd desktop/apps/ui
wails build
```

Gera o app nativo em `build/bin/`.

---

## Bindings Go → Angular (Roadmap)

A comunicação nativa entre Go e Angular é feita via **Wails Bindings** — funções Go expostas como `window.go.*` no frontend.

```go
// app.go — exemplo de binding futuro
func (a *App) OpenDICOMFile() string {
    // Abre seletor nativo de arquivo e retorna o path
}

func (a *App) RunAIInference(imagePath string) InferenceResult {
    // Envia imagem ao sidecar Python via HTTP e retorna coordenadas
}
```

```typescript
// Angular — chamada ao binding Go
import { OpenDICOMFile, RunAIInference } from '../../wailsjs/go/main/App';

const path = await OpenDICOMFile();
const result = await RunAIInference(path);
```

---

## Próximos Passos

- [ ] Implementar binding `OpenDICOMFile()` para usar seletor nativo do OS
- [ ] Integrar `cornerstone-wado-image-loader` para arquivos DICOM reais
- [ ] Conectar resultados do AI Engine às coordenadas de marcadores no canvas
- [ ] Adicionar exportação de relatório DICOM em PDF

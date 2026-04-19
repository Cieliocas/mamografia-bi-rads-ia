# Design System — "Clinical Obsidian"

Paleta otimizada para salas de laudo: fundo escuro de alto contraste, acentos de cor para achados críticos. Implementada em `desktop/apps/ui/frontend/tailwind.config.js` + `src/styles.css`.

## Tokens principais

| Token | Hex | Uso |
|---|---|---|
| `surface-dim` | `#0E0E0E` | Fundo geral (obsidiana) |
| `surface-container-high` | `#201F1F` | Painéis laterais |
| `primary` | `#AFA2FF` | Ações primárias, bordas ativas |
| `secondary` | `#00E3FD` | Acentos cyan, medições |
| `error` | `#FF6E84` | Marcadores de achados críticos |
| `on-surface-variant` | `#ADAAAA` | Textos secundários |

## Princípios

- **Contraste alto** prevalece sobre "bonito": salas de laudo têm iluminação baixa controlada, e cada ponto de cinza conta na percepção de achados.
- **Violet + cyan** como acentos para separar ação UI (violet) de medição clínica (cyan).
- **Vermelho (`error`)** reservado para marcadores críticos — nunca para UI comum.
- Conformidade futura com **GSDF** (DICOM Part 14) planejada para monitores calibrados.

## Funcionalidades da UI

### Viewer (Canvas 2D)
- Carregamento de imagens (`image/*`, `.dcm`)
- Zoom scroll/botões, Pan com Hand, fit-to-screen automático
- Contraste/brilho em tempo real via filtros CSS no canvas

### Ferramentas de anotação
- **Marker** — marcadores circulares (Mass/Finding)
- **Ruler** — linha dashed + label em pixels
- Painel de findings com lista dinâmica e remoção individual

### Sidebar (painéis)

| Painel | Descrição |
|---|---|
| Images | Exames ativos, card do arquivo, slots |
| History | Arquivos abertos na sessão com thumbnail |
| Analysis | Dimensões, zoom, contraste, nº de achados |
| Tools | Paleta completa (navegação, anotação, sliders) |

### Splash
- Tela inicial com progresso animado ligada a `/startup/status` do Go Core.
- Fecha automaticamente quando o sistema reporta `ready`.

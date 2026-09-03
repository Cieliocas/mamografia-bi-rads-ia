# Mamografia BI-RADS — AIdentify Desktop

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-2ea44f)
![Desktop](https://img.shields.io/badge/runtime-desktop%20local-0366d6)
![Stack](https://img.shields.io/badge/stack-Wails%20%2B%20Angular%20%2B%20FastAPI-8a63d2)
![Modo](https://img.shields.io/badge/modo-offline%20first-ff8c00)

Estação de trabalho desktop para apoio à análise de mamografias — execução 100% local/offline, integração de IA para classificação BI-RADS e ferramentas clínicas de anotação.

---

## Documentação

A documentação técnica completa vive em [`docs/`](docs):

- [Arquitetura](docs/ARCHITECTURE.md) — stack, monorepo, endpoints, segurança
- [Runbook](docs/RUNBOOK.md) — pré-requisitos, execução dev, build, troubleshooting
- [Design System](docs/DESIGN_SYSTEM.md) — paleta "Clinical Obsidian", UI, ferramentas
- [Chat Skills](docs/CHAT_SKILLS.md) — organização de conversas e fluxo de trabalho
- [Planos de Evolução](docs/plans/) — refatorações estruturais planejadas

Status e relatórios:

- [`relatorios/STATUS_ATUAL.md`](relatorios/STATUS_ATUAL.md) — ponte entre skills, estado real
- [`relatorios/RELATORIO_TREINO_*.md`](relatorios/) — relatórios diários de treino

---

## Quick Start

```bash
cd mamografia-bi-rads-ia
bash tools/run_desktop_dev.sh --rebuild-go
```

Ou duplo clique em `Mammo-Desktop-Dev.command` (macOS).

O script sobe Go Core + AI sidecar + UI Wails+Angular em um fluxo único, com hot-reload. Detalhes e troubleshooting no [Runbook](docs/RUNBOOK.md).

---

## Segurança e privacidade

**Nenhum dado de paciente sai do dispositivo.**

| Garantia | Detalhe |
|---|---|
| Comunicação local | Toda troca entre UI, Go Core e sidecar IA usa `127.0.0.1` (loopback) — sem tráfego externo |
| Token único por instalação | Gerado com `crypto/rand` na primeira execução; salvo em `~/.mammo-desktop/.token` (permissão `0600`) — nunca hardcoded no código |
| Dados clínicos locais | Banco SQLite e arquivos de áudio ficam em `~/.mammo-desktop/` no dispositivo do usuário |
| Sem telemetria | O aplicativo não coleta nem envia métricas, logs ou analytics para qualquer servidor externo |
| Sem dependência de nuvem | Funciona 100% offline após a instalação |

> **LGPD — Lei Geral de Proteção de Dados (Lei 13.709/2018)**  
> Imagens de mamografia e dados de pacientes são dados pessoais sensíveis de saúde (Art. 11).  
> O AIdentify processa esses dados exclusivamente no dispositivo local do profissional habilitado,  
> sem transmissão, armazenamento remoto ou compartilhamento com terceiros.  
> O operador/controlador dos dados é a instituição ou profissional que utiliza o software.

---

## Créditos

| Frente | Responsável |
|---|---|
| Aplicação desktop, anotação, integração | **Franciélio Evangelista dos Santos Castro** — PIBITI/CNPq, UFPI |
| Modelos de IA e sidecar de inferência | **Micaías Carvalho Vieira** — [`micaiasdev/mammo-ai-sidecar`](https://github.com/micaiasdev/mammo-ai-sidecar) |
| Orientação | **André Castelo Branco Soares** — UFPI |

A inferência é uma cascata de dois estágios (classificador de malignidade →
detector YOLOv11n) servida por ONNX Runtime. Detalhes, proveniência dos pesos e
limitações em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e
[`apps/ai-engine/README.md`](apps/ai-engine/README.md).

> ⚠️ **Apoio, não diagnóstico.** Os modelos são de pesquisa e **não foram
> validados clinicamente**. O BI-RADS sugerido pela IA é uma estimativa
> heurística. Ausência de marcação automática **não** indica ausência de lesão.
> Toda decisão clínica exige avaliação de radiologista.

---

## Roadmap

- Binding Wails `OpenDICOMFile()` para seletor nativo
- Cornerstone.js para DICOM 16-bit real
- AI Engine → marcadores automáticos no viewer
- Exportação de relatório (PDF, JSON, CSV, COCO, DICOM SR)
- Endurecimento de segurança (Unix socket local)
- Empacotamento release (`.dmg` macOS / `.exe` Windows)

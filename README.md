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
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

Ou duplo clique em `Mammo-Desktop-Dev.command` (macOS).

O script sobe Go Core + AI sidecar + UI Wails+Angular em um fluxo único, com hot-reload. Detalhes e troubleshooting no [Runbook](docs/RUNBOOK.md).

---

## Segurança e privacidade

- Comunicação restrita a `127.0.0.1` (loopback).
- Token compartilhado entre Go Core e sidecar.
- Armazenamento local — nenhum dado clínico trafega para fora da máquina.

---

## Roadmap

- Binding Wails `OpenDICOMFile()` para seletor nativo
- Cornerstone.js para DICOM 16-bit real
- AI Engine → marcadores automáticos no viewer
- Exportação de relatório (PDF, JSON, CSV, COCO, DICOM SR)
- Endurecimento de segurança (Unix socket local)
- Empacotamento release (`.dmg` macOS / `.exe` Windows)

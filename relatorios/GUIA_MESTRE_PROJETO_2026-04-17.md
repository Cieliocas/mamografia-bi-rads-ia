# Guia Mestre do Projeto — AIdentify Mamografia BI-RADS IA

Data: 2026-04-17  
Escopo: visão completa do projeto para onboarding de pessoas e agentes de IA

---

## 1) Resumo Executivo

O projeto **AIdentify** é uma aplicação desktop para apoio à análise de mamografias, com foco em execução local/offline, suporte à anotação visual e integração com inferência por IA.

Hoje o projeto está em um estágio **funcional de base**:

- Interface desktop em **Wails + Angular** já roda e oferece visualização/anotação manual.
- Backend local em **Go (go-core)** já sobe, expõe API local e supervisiona um sidecar Python.
- Sidecar de IA em **FastAPI + TensorFlow/Keras** já responde `/health` e `/predict`.
- Pipeline de treino em cluster (U-Net + SLURM) existe e foi validado em múltiplos ciclos.

O projeto também está em **transição técnica/documental**: há arquivos legados de arquitetura antiga (Electron/Nextron) convivendo com a stack atual (Wails/Angular). Este guia consolida o estado real do código e define o caminho para produto final.

---

## 2) Proposta de Valor do Produto

### Problema que resolve

Radiologistas precisam de uma estação de trabalho que una:

- visualização de imagem mamográfica,
- anotação estruturada de achados,
- apoio de IA para triagem/segmentação/classificação,
- operação local com privacidade (LGPD, sem cloud obrigatória).

### Proposta

Entregar uma workstation desktop médica que permita:

1. abrir exames localmente,
2. marcar/registar achados BI-RADS,
3. receber apoio de IA em tempo real,
4. exportar relatório clínico rastreável.

---

## 3) Estado Atual Real (Fonte: código)

## 3.1 Stack principal em uso hoje

- **Desktop Shell**: Wails v2
- **Frontend**: Angular 18 + Tailwind CSS
- **Orquestrador local**: Go + Gin
- **AI sidecar**: Python + FastAPI + TensorFlow/Keras
- **Treinamento**: TensorFlow/Keras + SLURM (cluster)

## 3.2 Módulos e responsabilidades

### `desktop/apps/ui` (Wails + Angular)

Responsável por:

- tela inicial/splash,
- visualizador de imagem (Canvas 2D),
- ferramentas de anotação (ROI/régua),
- UX clínica (dark mode, painéis).

Status atual:

- já existe interface rica e funcional para anotação manual;
- integração real com backend/IA ainda parcial (há elementos de UI ainda mockados, ex.: BI-RADS fixo no painel lateral);
- binding Go disponível no momento é mínimo (`Greet`).

### `desktop/apps/go-core` (orquestrador)

Responsável por:

- subir e monitorar sidecar Python (guardian),
- health check e recuperação automática,
- endpoints locais (`/healthz`, `/readyz`, `/startup/status`),
- proxy para IA (`/api/ai/*`),
- fila básica de tarefas (`/api/tasks/predict`),
- PDI local simples (`/api/pdi/windowing`).

Status atual:

- guardian funcional com restart e check periódico;
- endpoint de fila existe, mas `TaskProcessor` ainda é placeholder (não dispara pipeline completo de inferência);
- caminho de SQLite é criado, mas persistência relacional ainda não foi implementada.

### `desktop/apps/ai-engine` (sidecar FastAPI)

Responsável por:

- carregar modelo (`MODEL_PATH`),
- responder `/health`,
- inferência `/predict` com upload de imagem.

Status atual:

- se modelo existe e TensorFlow está disponível, usa predição real;
- se não, retorna comportamento mock para manter fluxo da aplicação.

### `src/ml` + `scripts/train.slurm` (treino)

Responsável por:

- treino de U-Net para segmentação de achados em mamografia,
- data loader CBIS-DDSM com augmentation + CLAHE,
- execução cluster com 2 GPUs via SLURM,
- checkpoints, resume, early stopping e redução de LR.

Status atual:

- pipeline de treino está operacional e reproduzível;
- ainda há ajustes de estabilidade numérica em aberto para runs com NaN em determinadas configurações.

---

## 4) Mapa de Arquivos Importantes (para qualquer IA)

## 4.1 Documentação principal

- `README.md` (raiz): visão geral atual do projeto
- `desktop/README.md`: visão da stack desktop atual
- `docs/chat-skills/README.md`: organização de trabalho por conversas/skills
- `relatorios/STATUS_ATUAL.md`: estado consolidado mais recente

## 4.2 Código principal

- UI desktop:
  - `desktop/apps/ui/main.go`
  - `desktop/apps/ui/app.go`
  - `desktop/apps/ui/frontend/src/app/app.ts`
  - `desktop/apps/ui/frontend/src/app/app.html`
- Orquestrador:
  - `desktop/apps/go-core/cmd/orchestrator/main.go`
  - `desktop/apps/go-core/internal/guardian/guardian.go`
  - `desktop/apps/go-core/internal/config/config.go`
  - `desktop/apps/go-core/internal/queue/queue.go`
  - `desktop/apps/go-core/internal/pdi/windowing.go`
- IA sidecar:
  - `desktop/apps/ai-engine/app/main.py`

## 4.3 Treinamento

- `src/ml/train.py`
- `src/ml/data_loader.py`
- `src/ml/unet.py`
- `scripts/train.slurm`
- `projetos/treinamento/` (snapshots por versão)

---

## 5) Arquitetura de Execução Atual

## 5.1 Fluxo runtime (desktop)

1. `run_desktop_dev.sh` prepara ambiente e sobe Wails.
2. O Go Core sobe e inicia o sidecar Python via guardian.
3. UI acessa o backend local para status operacional.
4. Proxy `/api/ai/*` encaminha chamadas para o sidecar.

## 5.2 Endpoints disponíveis

### Go Core (padrão `127.0.0.1:8088`)

- `GET /healthz`
- `GET /readyz`
- `GET /startup/status`
- `POST /api/tasks/predict`
- `POST /api/pdi/windowing`
- `ANY /api/ai/*`

### AI Sidecar (padrão `127.0.0.1:8090`)

- `GET /health`
- `POST /predict`

---

## 6) Funcionalidades Implementadas

## 6.1 UI/UX

Implementado:

- splash screen,
- abertura de imagem local,
- zoom/pan/fit,
- ajuste visual de brilho/contraste,
- marcação ROI e régua,
- histórico local em sessão,
- painel lateral com resumo de análise.

Parcial:

- painel de “insights de IA” ainda não está conectado integralmente ao resultado real da inferência.

## 6.2 Backend local (Go)

Implementado:

- health/readiness,
- supervisor de sidecar com restart,
- proxy local autenticado por header token,
- endpoint de PDI (windowing).

Parcial:

- persistência SQLite de casos/anotações não implementada,
- worker da fila ainda sem fluxo completo de negócio.

## 6.3 IA sidecar

Implementado:

- loading do modelo,
- endpoint de predição com máscara binária,
- fallback mock se modelo indisponível.

Parcial:

- resposta de inferência ainda simplificada para produto clínico,
- sem calibração/explicabilidade/versão de modelo estruturada.

## 6.4 Treinamento em cluster

Implementado:

- treino multi-GPU com MirroredStrategy,
- seleção de loss e hiperparâmetros por argumentos,
- augmentation + CLAHE,
- checkpoint best/latest/periódico,
- resume e backup state,
- monitoramento por `val_dice_coef`.

Parcial:

- há cenário de instabilidade (`NaN`) em algumas combinações (ex.: run v8, conforme relatórios).

---

## 7) Segurança, Privacidade e LGPD (estado atual)

Já existe:

- tráfego local via loopback,
- token compartilhado (`X-Local-Token`) entre proxy e sidecar,
- desenho offline-first.

Faltante para nível produto:

- criptografia de dados em repouso (SQLite/arquivos sensíveis),
- trilha de auditoria por usuário/ação,
- autenticação e perfis de acesso,
- política formal de retenção e descarte,
- assinatura/notarização e cadeia de confiança do binário.

---

## 8) Inconsistências e Débito Técnico Atual

1. **Documentação mista de stack**
- Há arquivos descrevendo Electron/Nextron e outros descrevendo Wails/Angular.
- O código ativo da UI está em Wails/Angular.

2. **Legados no repositório**
- Arquivos e docs antigos de fluxos anteriores ainda convivem com o estado novo.

3. **`.gitignore` x treinamento**
- Existem regras que ignoram paths de treino que ainda aparecem no histórico versionado.
- Necessário harmonizar política de versionamento de treino.

4. **Integração end-to-end incompleta**
- UI rica, backend funcional e sidecar funcional, mas ligação completa com persistência clínica e workflow de laudo ainda incompleta.

---

## 9) O que precisa existir para virar Produto Final

## 9.1 Requisitos funcionais mínimos (MVP clínico interno)

1. Abrir exame (DICOM/imagem) de forma robusta.
2. Visualizar com ferramentas clínicas estáveis.
3. Executar inferência real do modelo e sobrepor resultado na imagem.
4. Permitir revisão/edição manual do resultado da IA.
5. Salvar caso localmente (anotações + metadados + histórico).
6. Exportar relatório estruturado (PDF/JSON).

## 9.2 Requisitos não funcionais mínimos

1. Tempo de resposta aceitável na inferência local.
2. Estabilidade de sessão (sem travamentos em uso prolongado).
3. Segurança local básica (controle de acesso e trilha de eventos).
4. Instalador simples para usuário final (macOS/Windows).

---

## 10) Roadmap Recomendado por Fases

## Fase 1 — Consolidação de Base (curto prazo)

Objetivo: remover ambiguidade e fechar lacunas críticas de integração.

- unificar documentação para stack Wails/Angular,
- remover/arquivar arquivos legados não usados,
- integrar UI -> Go Core -> sidecar em um fluxo real de inferência,
- substituir elementos mock de diagnóstico por dados reais,
- criar contrato de API interno versionado (`/api/v1`).

Critério de saída:

- dado um arquivo de imagem, usuário consegue abrir, inferir, visualizar resultado e salvar sessão.

## Fase 2 — Persistência e Fluxo Clínico (médio prazo)

Objetivo: transformar demo técnica em fluxo de trabalho clínico local.

- implementar schema SQLite (pacientes, estudos, anotações, laudos),
- CRUD completo de casos e histórico de alterações,
- exportação de relatório (PDF + JSON estruturado),
- autenticação local (usuário/sessão/permissões básicas),
- cobertura de testes em módulos críticos (Go e Python).

Critério de saída:

- médico consegue trabalhar casos reais com rastreabilidade local.

## Fase 3 — Robustez de IA e Qualidade (médio/longo prazo)

Objetivo: elevar qualidade e confiabilidade do motor de IA.

- estabilizar treino (evitar NaN via ajustes de loss/métrica/gradiente),
- pipeline de avaliação padronizado (Dice/IoU/sensibilidade/especificidade),
- versionamento formal de modelos e benchmark por versão,
- validação cruzada e testes de regressão de inferência.

Critério de saída:

- processo de treino e promoção de modelo reproduzível com critérios objetivos.

## Fase 4 — Produto Distribuível (longo prazo)

Objetivo: entrega final para uso operacional.

- pipeline de build release para macOS/Windows,
- assinatura/notarização,
- instalador robusto e atualização controlada,
- observabilidade local (logs estruturados, diagnóstico simplificado),
- pacote de compliance (LGPD, documentação de operação e suporte).

Critério de saída:

- instalação one-click + operação estável + suporte técnico viável.

---

## 11) Backlog Priorizado (Top 15)

1. Unificar docs para Wails/Angular e remover referência ativa a Nextron.
2. Implementar binding Go real para seleção de arquivo DICOM.
3. Integrar chamada real de inferência da UI via Go Core.
4. Sobrepor máscara/resultado de IA no canvas da UI.
5. Remover BI-RADS fixo mock do painel e usar resposta real.
6. Definir schema SQLite e migrations iniciais.
7. Persistir sessão/anotações por exame.
8. Endpoint de salvar/carregar caso no Go Core.
9. Exportador de relatório clínico em PDF.
10. Testes unitários de guardian/queue/pdi no Go.
11. Testes de contrato de API sidecar e validações de payload.
12. Hardening do token local + rotação/configuração segura.
13. Ajuste de treino v9 (estabilidade numérica sem NaN).
14. Pipeline de benchmark de modelos (run -> métrica -> decisão).
15. Pipeline de build release e assinatura binária.

---

## 12) Guia de Execução para outra IA (Runbook de 10 minutos)

1. Ler este arquivo (`GUIA_MESTRE_PROJETO_2026-04-17.md`).
2. Ler `relatorios/STATUS_ATUAL.md` para estado operacional mais recente.
3. Validar stack real em código:
   - `desktop/apps/ui/main.go`
   - `desktop/apps/go-core/cmd/orchestrator/main.go`
   - `desktop/apps/ai-engine/app/main.py`
4. Rodar localmente:

```bash
cd mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

5. Confirmar saúde:

```bash
curl http://127.0.0.1:8088/healthz
curl http://127.0.0.1:8088/readyz
curl http://127.0.0.1:8090/health
```

6. Registrar tudo em relatório diário antes de encerrar sessão.

---

## 13) Riscos de Projeto (se não agir)

1. **Risco de desalinhamento técnico** por documentação conflitante.
2. **Risco de retrabalho** sem contrato único de arquitetura.
3. **Risco de baixa confiança clínica** sem pipeline robusto de validação do modelo.
4. **Risco de atraso de produto** sem roadmap com critérios de saída por fase.

---

## 14) Conclusão

O projeto já tem base técnica sólida e modular para virar produto real. O que falta não é "começar do zero", mas sim **concluir integração clínica, estabilizar IA, e industrializar entrega/distribuição**.

Em resumo:

- Base: pronta.
- Integração fim-a-fim: parcialmente pronta.
- Produto final: viável, desde que o roadmap acima seja seguido com disciplina.


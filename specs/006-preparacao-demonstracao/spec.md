# Spec 006 — Preparação para demonstração com profissional

| Campo | Valor |
|---|---|
| Prioridade | 🔴 Antecede qualquer demonstração clínica |
| Origem | Auditoria da aplicação em 2026-09-02 |
| Depende de | Specs 001–003 concluídas |

---

## 1. Problema

A aplicação está funcional: os fluxos principais foram percorridos ponta a ponta
sem um único erro de console e com todas as requisições respondendo 2xx. O laudo
em PDF (2 páginas, 2,1 MB), o laudo em HTML, o preview anotado, os três formatos
de exportação e o backup do banco funcionam. Os caminhos de erro devolvem código
adequado: arquivo que não é imagem → 422, caminho inexistente → 422, listagem
fora do `$HOME` → 403.

O que impede a demonstração a um profissional não é defeito de funcionamento —
é **um risco de comunicação e um bloqueio de distribuição**.

## 2. Achados da auditoria

### A. O modo simulado é indistinguível do real na interface 🔴

Quando os artefatos ONNX não carregam, o serviço cai automaticamente para o
backend `mock`, que devolve **dois achados sintéticos fixos**. Nessa condição:

| Sinal | Modo real | Modo simulado |
|---|---|---|
| `/readyz` | `ai_engine: ready` | `ai_engine: ready` — **idêntico** |
| Barra de estado | "IA disponível" | "IA disponível" — **idêntico** |
| Painel de achados | achados da cascata | dois achados sintéticos |
| Única diferença | `model_id: cascade-hybrid-yolo11n-onnx` | `model_id: unet-mammo-mock-v1`, em cinza pequeno |

O `notes` de cada achado traz "Mock — model not loaded", mas em texto secundário.

**Consequência:** se os modelos falharem ao carregar durante uma demonstração —
artefato ausente, caminho errado, venv quebrada — o profissional verá **achados
inventados apresentados como saída de IA**, com marcação sobre a mamografia e
categoria BI-RADS. É o pior modo de falha possível para este projeto, e viola o
princípio P2 da constituição na prática, ainda que não na letra.

### B. O release não é autocontido 🔴

`tools/build_release.sh` empacota o frontend Angular e o Go Core no `.app`, mas
**não empacota o serviço Python, a sua venv nem os artefatos ONNX**. Um `.app`
distribuído sobe, exibe DICOM e permite anotar — mas não tem IA.

Os modelos somam 124 MB e não são versionados; a venv ocupa 311 MB. Não existe
hoje caminho de distribuição para eles.

**Consequência:** a demonstração só é possível na máquina de desenvolvimento,
por `tools/run_desktop_dev.sh`. Levar a ferramenta a um serviço de radiologia,
ou deixá-la com o profissional, não é possível.

### C. Navegar até um exame é trabalhoso 🟡

O painel de arquivos só tem "voltar" pelo histórico da sessão; não há subir um
nível nem caminho editável. Chegar a um exame típico de CD
(`.../<exame>/`) exige seis cliques em sequência. No app
Wails o seletor nativo de pasta contorna, mas o caminho restaurado da sessão
anterior prende o usuário num diretório profundo sem saída.

### D. A exportação carrega identificador de paciente 🟡

O CSV e o JSON incluem `patient_id`, vindo do PatientID do DICOM. No exame
utilizado na avaliação esse campo já vem pseudonimizado na origem
(`ANONYMOUS_MG_…`), mas isso é característica do equipamento, não garantia da
ferramenta. Qualquer envio a terceiros — inclusive ao parceiro, para retreino —
exige pseudonimização feita pela aplicação.

### E. Pendências menores 🟢

| Item | Detalhe |
|---|---|
| `CHANGELOG.md` documenta rotas inexistentes | Diz `POST /api/export/backup` e `POST /api/import/restore`; as reais são `GET /api/backup` e `POST /api/restore` |
| `ON CONFLICT` do `Save` não atualiza `study_id` | Uma anotação não migra entre estudos. Sem efeito prático (ids são UUID por estudo) |
| JPEG-LS multi-componente entrelaçado | Não implementado; mamografia é monocromática, então não afeta o domínio |
| Histórico do Git retém as figuras removidas | Commit `de3149a7`. Impede publicar o repositório enquanto não for reescrito |

## 3. Requisitos

### RF-01 — O modo simulado precisa ser inequívoco 🔴
- `/readyz` e `/health` do Go Core distinguem **modelo carregado** de **serviço no ar**.
- A barra de estado mostra estado distinto (ex.: "IA simulada") quando `model_loaded` é falso.
- O painel de achados exibe faixa de alerta, em cor de advertência e não dispensável,
  declarando que os achados são sintéticos e não vieram de modelo.
- As caixas desenhadas no visualizador recebem marcação visual distinta em modo simulado.

### RF-02 — Release autocontido, ou pré-requisito explícito 🔴
Uma das duas saídas, à escolha:
- **(a)** `build_release.sh` passa a empacotar o serviço Python (interpretador embutido
  ou venv relocável) e os `.onnx`, produzindo `.app` que funciona em máquina limpa; ou
- **(b)** o instalador verifica os pré-requisitos na primeira execução e, faltando
  qualquer um, exibe instruções em vez de cair silenciosamente para o modo simulado.

### RF-03 — Navegação de pastas utilizável 🟡
- Controle de diretório-pai (entrada `..` ou trilha de navegação clicável), limitado ao `$HOME`.
- Atalho para as pastas de uso frequente da sessão.

### RF-04 — Pseudonimização na exportação 🟡
- Opção de exportar com `patient_id` substituído por identificador estável e não reversível.
- Padrão seguro: pseudonimizar, com escolha explícita para exportar identificado.

### RF-05 — Roteiro de demonstração 🟡
- Sequência escrita de 10 a 15 minutos, cobrindo abrir exame, janelamento, marcação
  manual, inferência, aceitar/editar/rejeitar, laudo e exportação.
- Verificação prévia (checklist) de que os modelos estão carregados **antes** de começar.

### RF-06 — Saneamento 🟢
- `CHANGELOG.md` com as rotas corretas.
- Decisão registrada sobre `study_id` no `ON CONFLICT`.
- Histórico do Git reescrito antes de qualquer publicação.

## 4. Critérios de aceite

- [ ] **CA-01** Com os `.onnx` removidos, a interface declara o modo simulado de
      forma inequívoca em pelo menos dois pontos, e nenhum achado sintético
      aparece sem alerta associado.
- [ ] **CA-02** `/readyz` distingue serviço no ar de modelo carregado.
- [ ] **CA-03** A demonstração roda do início ao fim pelo roteiro, sem intervenção
      em terminal, com os modelos reais carregados.
- [ ] **CA-04** É possível navegar do exame até a raiz do `$HOME` apenas pela interface.
- [ ] **CA-05** Export pseudonimizado não contém o PatientID do DICOM.
- [ ] **CA-06** `go test ./...`, `pytest` e `ng test` passam; `ng build` limpo.
- [ ] **CA-07** Build de release gerado e aberto para teste do orientando.

## 5. Fora de escopo

Autenticação de usuário · integração RIS/PACS · assinatura com Apple Developer ID ·
instalador Windows testado em máquina limpa · retreino dos modelos.

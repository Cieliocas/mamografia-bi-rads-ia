# Changelog

All notable changes to **AIdentify** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Não publicado]

### Adicionado

- **Inferência real por cascata ONNX** (spec 001). O sidecar deixa de responder
  achados sintéticos e passa a executar dois modelos de verdade, offline:
  classificador de malignidade (INbreast-Hybrid, Shen et al. 2019) como *gate*,
  seguido do detector YOLOv11n (TOMPEI-CMMD) quando `P(maligno) ≥ 0,11`.
  Servido por ONNX Runtime — **TensorFlow deixa de ser dependência de runtime**.
  Modelos e sidecar são autoria de Micaías Carvalho Vieira.
- **Sidecar reestruturado** em `app/{config,schemas,security}`, `app/routers/` e
  `app/inference/` (registry + backends `cascade`/`mock`), com 24 testes.
- **`MODEL_BACKEND` propagado pelo Go Core**: o guardian sobe o sidecar em
  `cascade` por padrão (`guardian.SetEnv`), com fallback automático para `mock`
  quando os `.onnx` não estão instalados.
- **Terceiro tipo de achado — `assessment`**: avaliação nível-imagem, sem caixa,
  devolvida quando o gate fecha. `confidence` carrega `P(maligno)`.
- **`models/CHECKSUMS.txt`** versionado, para rastrear a identidade dos pesos que
  o repositório não versiona.

### Corrigido

- **Resposta silenciosamente errada em DICOM comprimido.** O sidecar não
  descomprimia JPEG-LS / JPEG Lossless (faltavam os plugins do pydicom) e
  substituía a imagem por um frame preto 512×512 — a cascata então devolvia um
  veredito "benigno" confiante sobre uma imagem que ninguém leu. Agora os codecs
  (`pylibjpeg`, `pylibjpeg-libjpeg`, `pyjpegls`) fazem parte do runtime, e
  `/predict` responde **422** quando não consegue decodificar com um modelo real
  carregado. O frame de fallback só permanece em modo mock, do qual dev e CI
  dependem.
- Erro de inferência do Go Core passa a incluir a mensagem do sidecar, em vez de
  apenas o código HTTP; a falha deixa de ser engolida em silêncio na interface.
- Export CSV emitia a string literal `<nil>` em células vazias, e o COCO
  serializava `"annotations": null` num export sem anotações.
- `docs/ARCHITECTURE.md` corrigido: descrevia TensorFlow/Keras com U-Net e
  Angular 18, nada disso correspondendo ao código.

- **Ciclo de anotação semiautomática** (spec 002). As sugestões da IA deixam de
  ser lista de texto: são desenhadas sobre a imagem como caixas tracejadas — em
  cor fora da paleta BI-RADS, para nunca serem confundidas com marcação validada
  — e podem ser **aceitas, editadas ou rejeitadas**. Aceitar converte a sugestão
  em ROI editável e persistível.
- **Avisos clínicos obrigatórios**, não dispensáveis: "apoio, não diagnóstico";
  aviso explícito de que a ausência de marcação não indica ausência de lesão
  quando o gate fecha; BI-RADS da IA rotulado "(estimado)"; nota de que a
  inferência analisou o primeiro frame em exames multi-frame.
- **Proveniência da anotação** (spec 003, migração `007`). Toda anotação registra
  sua origem — `manual`, `ai_accepted`, `ai_edited`, `ai_rejected` — com o modelo,
  a confiança e **a geometria original sugerida antes da correção humana**. É o
  par (sugerido, corrigido) que torna o dado utilizável para retreino.
- **Export com proveniência** em JSON, CSV e COCO. Rejeições saem em chave
  própria `ai_rejected`, e não em `annotations`: um falso positivo não pode virar
  rótulo de treino.
- **Detecção de DICOM sem extensão** pelo magic `DICM` (PS3.10). Export de CD e
  dump de PACS nomeiam imagens como `<incidência>`, sem extensão — antes ficavam
  invisíveis no navegador de arquivos.
- **Avaliação técnica** (spec 004): bateria reexecutável e resultados medidos
  sobre mamografias reais em `specs/004-avaliacao-tecnica/`.

### Notas

> ⚠️ Modelos de pesquisa, **não validados clinicamente**. `birads` é heurístico.
> O gate tem sensibilidade ≈ 0,69 no CMMD: **ausência de caixa não significa
> ausência de lesão**. Detector fraco fora do domínio CMMD.

---

## [0.1.0] — 2026-05-27

### Added

#### Core backend (Go)
- **DICOM viewer**: servidor Go (Gin) renderiza arquivos DICOM para PNG com aplicação de janelamento WW/WC, suporte a múltiplos frames e pré-visualização em cache.
- **Inferência AI**: contrato completo com o sidecar Python (`POST /predict`, proxy autenticado, fila, guardian) e exibição dos achados na UI. Nesta versão o sidecar respondia com **achados sintéticos (mock)** — a inferência real chegou depois (ver *Não publicado*).
- **Gestão de estudos**: API REST (`POST /api/studies`, `GET /api/studies`) para criação, listagem e associação de estudos a pacientes.
- **Anotações**: endpoints para salvar (`POST`) e recuperar (`GET`) anotações ROI (elipse/retângulo) com rótulo, BI-RADS, notas e duração de nota de voz.
- **Pacientes**: CRUD completo de pacientes com `PATCH /api/patients/:id`.
- **Laudo PDF com imagem**: `GET /api/studies/:id/pdf` gera PDF via `fpdf` com campos clínicos, imagem DICOM anotada incorporada e assinatura digital.
- **Relatório HTML**: `GET /api/export/report/:id` retorna laudo HTML auto-imprimível com imagem anotada embutida em Base64.
- **Shared imaging package** (`internal/imaging`): renderização DICOM desacoplada do handler HTTP para reutilização no gerador de PDF.
- **Health / Readiness**: `GET /healthz` e `GET /readyz` com estado do banco e do sidecar AI.
- **Backup SQLite**: `POST /api/export/backup` gera snapshot do banco; `POST /api/import/restore` restaura a partir de backup.

#### Frontend Angular
- **Visualizador canvas dual**: `imgCanvas` aplica filtros CSS (brilho/contraste/inversão); `overlayCanvas` renderiza ROIs, réguas e traços de pincel.
- **Grid de viewports**: layouts 1×1, 1×2, 2×2 com navegação por teclado e troca de VP ativo.
- **Ferramentas de marcação**: ROI (elipse/rect), régua com unidade mm (calibrada por DICOM pixel spacing), seta, pincel livre, borracha ROI e régua.
- **Lupa / Magnifier** (Plano R): lente circular de 3× sobreposta ao cursor; activada com tecla `M`.
- **Comparação temporal** (Plano S): botão "Comparar" na aba Pacientes abre um estudo anterior no VP1 em layout 1×2.
- **Calibração de régua por VP** (Plano T): cada viewport armazena seu próprio `pixelSpacing`; badge `✓ CAL X.XXX mm/px` exibido quando o DICOM contém o tag 0028,0030.
- **Painel de metadados DICOM** (Plano P): grupos colapsáveis (Paciente, Estudo, Série, Equipamento, Aquisição) com formatação de valores.
- **Painel de Achados AI**: exibe resultados de inferência com BI-RADS, confiança e localização.
- **Painel de Laudo clínico**: campos BI-RADS global, conclusão, recomendação, assinatura; botões PDF e HTML.
- **Painel de Ficheiros**: navega pelo sistema de ficheiros nativo (Wails) com navegação em série por teclado (←/→).
- **Painel de Histórico**: últimos 20 estudos abertos com restauração de anotações.
- **Painel de Pacientes**: listagem e edição de dados do paciente associado ao estudo activo.
- **Notas de voz**: gravação e reprodução de notas de áudio por ROI, com indicador de duração.
- **Undo/Redo** por viewport (stack local).
- **Preset de janelamento**: Padrão, Tecido mole, Microcalcificações, Alta exposição.
- **Navegação multi-frame**: `←/→` percorre frames de DICOM multi-frame; barra de frame exibida quando `frameCount > 1`.
- **Barra de estado**: indicadores de conectividade Go Core e estado do sidecar AI.
- **Exportar/Importar banco**: botões na barra de topo para backup e restauração SQLite.

### Fixed
- CI: `go-version` ajustado para 1.25 (requisito do Gin 1.12) no job `core`.
- Dependências Angular e Go actualizadas para versões sem vulnerabilidades conhecidas.

---

[0.1.0]: https://github.com/Cieliocas/mamografia-bi-rads-ia/releases/tag/v0.1.0

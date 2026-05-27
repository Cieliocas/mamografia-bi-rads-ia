# Changelog

All notable changes to **AIdentify** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-05-27

### Added

#### Core backend (Go)
- **DICOM viewer**: servidor Go (Gin) renderiza arquivos DICOM para PNG com aplicação de janelamento WW/WC, suporte a múltiplos frames e pré-visualização em cache.
- **Inferência AI**: integração com sidecar Python (YOLOv8) para detecção automática de achados mamográficos; resultado retornado como lista de `FindingDTO` com caixa delimitadora e classificação BI-RADS.
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

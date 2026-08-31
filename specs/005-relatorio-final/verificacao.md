# Verificação — Spec 005

**Data:** 2026-08-30
**Entregável:** `~/Cielio/IC:IT/Relatorio_Final_PIBITI_Francielio.docx` (688 KB)
**Gerador:** [`gerar_relatorio.js`](gerar_relatorio.js) — reexecutável, o documento é reprodutível

---

## Critérios de aceite

| # | Critério | Resultado |
|---|---|---|
| CA-01 | Relatório completo no modelo oficial, Partes I–III | ✅ 18 seções, 7 tabelas, 2 figuras, ~4.100 palavras |
| CA-02 | Correções narrativas aplicadas | ✅ Seção 4.6, com tabela comparativa parcial × final |
| CA-03 | `docs/ARCHITECTURE.md` e `CHANGELOG.md` corrigidos | ✅ ARCHITECTURE na Spec 001; CHANGELOG estendido com specs 002–004 |
| CA-04 | `relatorios/` desatualizados arquivados ou marcados | ✅ Tarja de documento histórico |
| CA-05 | Nenhuma alegação não verificável no código | ✅ Todo número vem de `specs/004-avaliacao-tecnica/resultados.md` ou de contagem no repositório |
| CA-06 | Revisão de leitura pelo orientador | ⬜ **Pendente — ação do orientando** |

## Saneamento da documentação

| # | Tarefa | Estado |
|---|---|---|
| T-01 | `docs/ARCHITECTURE.md`: ONNX Runtime, Angular 21, proveniência dos modelos | ✅ (Spec 001) |
| T-02 | `CHANGELOG.md`: alegação falsa de YOLOv8 corrigida; specs 001–004 registradas | ✅ |
| T-03 | `README.md`: créditos da parceria | ✅ (Spec 001) |
| T-04 | `relatorios/` marcados como históricos | ✅ tarja em STATUS_ATUAL, ROADMAP e GUIA_MESTRE |
| T-05 | `NEXT_SESSION.md` marcado como obsoleto | ✅ |
| T-06 | `docs/plans/README.md` aponta para `specs/` | ✅ |

Os arquivos de `relatorios/` e `NEXT_SESSION.md` **não são versionados** (constam do
`.gitignore`), logo nunca foram públicos — enganavam apenas localmente. Optou-se
por tarjá-los em vez de apagá-los: são registro de trabalho do orientando.

## Verificação do documento

Feita **estruturalmente**, não visualmente: não há LibreOffice nem pandoc nesta
máquina, então o `.docx` não pôde ser renderizado para conferência de página.

O que foi verificado:

- estrutura OOXML válida, 27 partes, 2 imagens embutidas;
- 18 seções na ordem esperada, Partes I a III presentes;
- 7 tabelas com larguras de coluna e de célula em DXA (requisito para render
  correto no Word e no Google Docs);
- texto extraído íntegro, sem caracteres corrompidos, com acentuação correta.

> **Pendente de conferência visual pelo orientando** antes do envio: paginação,
> quebras de página e posicionamento das figuras.

## Decisões de conteúdo registradas

**As duas figuras são de mamografia real, sem identificadores.** Foram renderizadas
a partir do DICOM (pixels e anotações desenhadas apenas), nunca capturadas da
interface — a tela do aplicativo exibe o `PatientID`. A Figura 1 leva tarja de
**ilustrativa** no próprio corpo da imagem, porque a cascata não detectou achados
neste exame; apresentá-la sem a tarja sugeriria uma detecção que não houve.

> **Confirmar com o orientador** se o uso da imagem do exame no relatório requer
> documentação de consentimento ou aprovação ética. A imagem está desidentificada,
> mas a decisão é institucional, não técnica.

**A seção 4.6 narra as revisões de decisão** (Electron→Wails, U-Net→cascata) com
justificativa técnica, em vez de omiti-las. O relatório parcial descreve decisões
que mudaram; um relatório final que as ignorasse seria inconsistente com ele.

**Todas as métricas dos modelos são atribuídas a Micaías Carvalho Vieira** e
identificadas como oriundas do conjunto de validação daquele plano de trabalho,
não desta ferramenta.

**As limitações estão na conclusão, sem atenuação** — ausência de validação
clínica, N = 4 de caso negativo, sensibilidade de ≈ 0,69 do classificador,
fragilidade fora do domínio CMMD e a divergência de normalização.

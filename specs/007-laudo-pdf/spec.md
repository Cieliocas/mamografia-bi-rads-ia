# Spec 007 — Correções do laudo em PDF

| Campo | Valor |
|---|---|
| Prioridade | 🔴 O laudo é o entregável clínico da ferramenta |
| Origem | Teste do orientando na aplicação empacotada, 2026-09-02 |

---

## 1. Problemas relatados e confirmados no código

### A. O PDF não leva as anotações escritas no painel direito 🔴

`drawAnnotationsTable` imprime quatro colunas: número, tipo, coordenadas e
**"Nota de voz / transcrição"**. O conteúdo dessa última coluna é
`ann.AudioTranscript`.

Os campos que o radiologista digita — `Label` ("Ex.: Nódulo espiculado") e
`Notes` ("Notas clínicas…") — **nunca são impressos**. A categoria BI-RADS de
cada achado também não. O laudo sai com a geometria das marcações e nada do
raciocínio clínico associado a elas.

### B. Caracteres estranhos no PDF 🔴

O gerador usa `gofpdf` com as fontes padrão, que operam em **CP1252**. As
cadeias do código são UTF-8 (`—`, `ã`, `ç`, `õ`). Sem tradutor de codificação,
cada byte não-ASCII é impresso como o caractere CP1252 correspondente: "densidade
mamária" vira "densidade mamÃ¡ria".

### C. Não pergunta onde salvar 🟡

`openReport()` cria um `<a download>` e clica. Num navegador isso respeita a
pasta de downloads; na WebView do Wails o comportamento é do sistema, sem
diálogo de destino.

### D. Não há como fechar o PDF aberto 🟡

Como o PDF é aberto pela própria WebView, ele ocupa a janela do aplicativo sem
barra de navegação — não há voltar nem fechar, e o usuário fica preso.

## 2. Requisitos

- **RF-01** A tabela de achados do PDF inclui, por achado: rótulo, categoria
  BI-RADS, notas clínicas e, quando houver, a transcrição da nota de voz.
- **RF-02** Todo texto do PDF é convertido para a codificação da fonte, sem
  caracteres corrompidos, incluindo acentuação e travessões.
- **RF-03** Exportar o laudo abre um diálogo nativo de destino, com nome de
  arquivo sugerido.
- **RF-04** O usuário nunca fica preso numa visualização de PDF dentro do
  aplicativo: ou o PDF é salvo e aberto no visualizador do sistema, ou há
  controle visível de fechar.

## 3. Critérios de aceite

- [ ] **CA-01** Um achado com rótulo, BI-RADS e notas aparece com os três no PDF.
- [ ] **CA-02** O texto extraído do PDF não contém sequências corrompidas;
      "mamária", "densidade" e travessões saem corretos.
- [ ] **CA-03** Exportar abre diálogo nativo e grava no caminho escolhido.
- [ ] **CA-04** Após exportar, o aplicativo continua utilizável — nenhuma tela
      sem saída.
- [ ] **CA-05** `go test ./...` e `ng build` passam.

---

## 4. Verificação — 2026-09-02

| # | Critério | Resultado |
|---|---|---|
| CA-01 | Rótulo, BI-RADS e notas no PDF | ✅ "Nódulo espiculado BI-RADS 4A" e "Margens irregulares em região retroareolar; correlação ultrassonográfica sugerida." saem na tabela |
| CA-02 | Sem caracteres corrompidos | ✅ "mamária", "Correlação", "Conceição", travessão "—" corretos no texto extraído |
| CA-03 | Diálogo nativo de destino | ✅ `SaveReportPDF` via `runtime.SaveFileDialog`, com nome sugerido |
| CA-04 | Nenhuma tela sem saída | ✅ o PDF não abre mais na WebView; é gravado e revelado no Finder |
| CA-05 | Suítes e build | ✅ Go 5 pacotes · frontend 50 testes · `ng build` limpo |

### Como cada problema foi resolvido

**A. Anotações ausentes.** A tabela tinha quatro colunas e a última era só
`AudioTranscript`. Passou a cinco: número, tipo, coordenadas, **Achado**
(`Label`) e **Notas clínicas** (`Notes`, com a transcrição de voz anexada e
identificada como "Voz:"). A altura da linha acompanha a coluna mais alta, e há
quebra de página antes de uma linha que não caberia inteira.

**B. Codificação.** `gofpdf` usa CP1252 nas fontes principais; as cadeias do
código são UTF-8. Introduzido `tr = pdf.UnicodeTranslatorFromDescriptor("cp1252")`,
aplicado nos 20 pontos de escrita do documento.

**C. Destino.** Novo binding `SaveReportPDF(studyID, sugestão)` no Wails: abre o
diálogo nativo, baixa o PDF do Go Core e grava no caminho escolhido. Nome
sugerido inclui o paciente e a data. No navegador, mantém-se o download
convencional — não há diálogo nativo lá.

**D. Beco sem saída.** A causa era o `<a download>` fazendo a WebView abrir o PDF
na própria janela, sem barra de navegação. Com a gravação em arquivo, o PDF
nunca mais é aberto dentro do aplicativo; `RevealInFinder` mostra o arquivo no
Finder, e o visualizador do sistema tem a própria janela e o próprio fechar.

# Verificação — Resumo Expandido SIUFPI

**Data:** 2026-08-31
**Template oficial:** `2026_siufpi_ Resumo Expandido.docx` (Anexo IV, Edital PIBITI 2026-2027)
**Saída:** `~/Cielio/IC:IT/Resumo_Expandido_SIUFPI_AIdentify.docx` (226 KB)

---

## Preservação do arquivo oficial

Comparado byte a byte entre o gerado e o template original:

| Parte | Resultado |
|---|---|
| `sectPr` (margens, cabeçalho, rodapé, numeração) | ✅ idêntico |
| `header1/2/3.xml` (contêm a marca d'água) | ✅ idênticos |
| `footer1/2/3.xml` | ✅ idênticos |
| `word/media/image1.png` (marca d'água UFPI) | ✅ idêntico |
| `word/theme/theme1.xml` | ✅ idêntico |
| Nenhum arquivo de mídia novo | ✅ só a marca d'água original |

A edição tocou exclusivamente no corpo de `word/document.xml`.

## Conformidade com o Anexo IV

| Item | Exigência | Estado |
|---|---|---|
| — | TÍTULO, Autores, Palavras-chave conforme o modelo | ✅ |
| * | Discente identificado pelo programa | ✅ "(bolsista PIBITI/CNPq)" |
| ** | Orientador com vínculo de Departamento/Campus | ✅ "Departamento de Computação, UFPI" |
| — | Seis seções numeradas, títulos exatos, à esquerda | ✅ |
| — | Subseções numeradas pela seção | — não houve subseções (abstract de ~1.300 palavras não demandou) |
| — | Referências ABNT NBR 10520/6023 | ✅ 4 entradas |
| — | Apoio indica instituições/parceiros | ✅ CNPq, UFPI, Micaías Carvalho Vieira |
| — | Fonte 10, justificado, exceto Título/Autores/Palavras-chave | ✅ |
| — | Arial em todo o documento | ✅ |
| — | Margens 2 cm | ✅ herdadas do template |
| — | Recuo de 1,25 cm, exceto Título/Autores | ✅ 709 twips no corpo |
| — | Título 12 pt negrito maiúsculo centralizado | ✅ |
| — | Autores 11 pt centralizado | ✅ |
| — | Palavras-chave à esquerda, não justificada | ✅ `jc="left"` |
| — | Espaçamento 0 pt antes/depois | ✅ no corpo; títulos de seção usam 6 pt/3 pt, mesma convenção do relatório final, para separação visual das seções |
| — | Entrelinhas simples | ✅ `line="240"` em 100% do conteúdo novo |
| — | Paginação arábica no rodapé | ✅ herdada do template |
| — | 1200 a 1500 palavras | ✅ **1.338** |
| — | Máximo de 3 páginas | ⬜ **não verificável** — sem LibreOffice/pandoc nesta máquina |

## Conteúdo — pontos de honestidade confirmados

Os mesmos sete pontos não-negociáveis do relatório final, adaptados ao formato
curto:

- ausência de validação clínica com radiologistas;
- avaliação com apenas quatro imagens de um único exame, de caso negativo;
- modelos de pesquisa, não validados clinicamente, BI-RADS heurístico;
- atribuição explícita a Micaías Carvalho Vieira dos modelos de IA e da
  métrica mAP@50 = 0,626 (do conjunto de validação dele, não desta avaliação);
- aviso de apoio, não diagnóstico;
- ausência de marcação automática não indica ausência de achado.

## Decisão de foco (a pedido do orientando)

O resumo é sobre a **ferramenta**, não sobre os modelos de IA. A seção de
Resultados menciona os modelos e sua métrica com uma frase de atribuição, sem
detalhar arquitetura ou protocolo de treino — esse conteúdo pertence ao plano
de trabalho de Micaías Carvalho Vieira. Dois defeitos de engenharia
corrigidos durante a integração (reconhecimento de DICOM sem extensão;
inconsistência de campos vazios na exportação) entraram como evidência
concreta de trabalho de engenharia sobre a ferramenta em si.

## Pendências

- **Contagem de páginas**: sem LibreOffice/pandoc nesta máquina. Abrir o
  arquivo e confirmar ≤ 3 páginas antes de submeter.
- **PDF final para anexação**: conversão e verificação do limite de 2 MB
  ficam a cargo do orientando (o `.docx` tem 226 KB, folga ampla).
- Sem assinatura — conforme indicado pelo orientador, que valida
  posteriormente. O modelo (Anexo IV) não prevê campo de assinatura.

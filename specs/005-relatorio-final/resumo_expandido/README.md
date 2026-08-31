# Resumo Expandido — SIUFPI / SDTI

Gera `Resumo_Expandido_SIUFPI_AIdentify.docx` a partir do **template oficial**
da CPESI/PROPESQI/UFPI (`2026_siufpi_ Resumo Expandido.docx`, Anexo IV do
Edital PIBITI 2026-2027), editando o `word/document.xml` do próprio arquivo
oficial — não recriando o documento do zero.

## Por quê editar em vez de recriar

O template carrega uma **marca d'água oficial da UFPI** no cabeçalho (imagem
`word/media/image1.png`, ~7,8 × 11 cm, atrás do texto, presente em todas as
páginas) e margens ajustadas para acomodá-la (topo 2,75 cm, base 3,5 cm — não
os 2 cm literais da regra, porque a regra descreve o corpo do texto e a
marca d'água ocupa parte da margem). Reproduzir isso do zero em outra
biblioteca arriscaria uma marca d'água sutilmente diferente da oficial.
Editando o arquivo original, cabeçalho, rodapé e marca d'água são preservados
byte a byte — verificado em `verificacao.md`.

## Como funciona

1. `build_resumo.py` espera o template oficial descompactado em
   `resumo_unpacked/` (não versionado — é o arquivo do usuário, com marca
   d'água institucional, fora do escopo deste repositório).
2. Localiza os 49 parágrafos placeholder do modelo e substitui:
   - Título, Autores, Palavras-chave — pelos campos reais, com a formatação
     exigida (12 pt/11 pt/10 pt, centralizado/centralizado/à esquerda,
     isentos de justificação).
   - As seis seções obrigatórias — pelo conteúdo em `content/*.txt`.
   - O bloco de instruções do modelo ("Da formatação do documento:" em
     diante) — removido, não é conteúdo a submeter.
3. Reempacota preservando cabeçalho, rodapé, tema e `sectPr` inalterados.

## Conteúdo

Cada seção em `content/` é um arquivo próprio, com parágrafos separados por
linha em branco dupla — foco declarado na ferramenta, não nos modelos de IA
(autoria de Micaías Carvalho Vieira, plano de IC paralelo, creditado na seção
Apoio e citado com a devida atribuição em Resultados).

## Regenerar

```bash
# 1. Descompactar o template oficial do usuário (não incluído aqui)
unzip "~/Downloads/2026_siufpi_ Resumo Expandido.docx" -d resumo_unpacked

# 2. Editar content/*.txt conforme necessário

# 3. Rodar
python3 build_resumo.py   # reescreve resumo_unpacked/word/document.xml

# 4. Reempacotar
(cd resumo_unpacked && zip -Xr ../Resumo_Expandido_AIdentify.docx .)
```

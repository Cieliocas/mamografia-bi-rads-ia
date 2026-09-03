# -*- coding: utf-8 -*-
"""Preenche o template oficial 2026_siufpi_Resumo Expandido.docx com o conteúdo
do AIdentify, mantendo cabeçalho/rodapé/marca d'água/margens do arquivo original
intocados. Edita apenas os parágrafos de word/document.xml."""
import re
from pathlib import Path
from xml.sax.saxutils import escape

BASE = Path("resumo_unpacked")
DOC = BASE / "word/document.xml"
CONTENT = Path("resumo_content")

def read_paras(name):
    """Lê um .txt com parágrafos separados por linha em branco dupla."""
    txt = (CONTENT / f"{name}.txt").read_text(encoding="utf8").strip()
    return [p.strip().replace("\n", " ") for p in txt.split("\n\n") if p.strip()] if "\n\n" in txt else [l.strip() for l in txt.split("\n") if l.strip()]

def read_one(name):
    return (CONTENT / f"{name}.txt").read_text(encoding="utf8").strip()

RFONT = '<w:rFonts w:ascii="Arial;sans-serif" w:hAnsi="Arial;sans-serif"/>'

def run(text, sz=20, bold=False, italic=False):
    b = "<w:b/>" if bold else ""
    i = "<w:i/>" if italic else ""
    return (f'<w:r><w:rPr>{RFONT}{b}{i}<w:color w:val="000000"/>'
            f'<w:sz w:val="{sz}"/></w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>')

def para_special(text, sz, bold, align):
    """Título / Autores / Palavras-chave — sem recuo, alinhamento próprio, isentos
    de justificação (regra: exceto TÍTULO, Autores e Palavras-chave)."""
    return (f'<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240"/>'
            f'<w:jc w:val="{align}"/></w:pPr>{run(text, sz, bold)}</w:p>')

def para_blank(sz=20):
    return (f'<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240"/></w:pPr>'
            f'<w:r><w:rPr>{RFONT}<w:sz w:val="{sz}"/></w:rPr></w:r></w:p>')

def heading(text):
    """Seções obrigatórias 1–6: Arial 10 negrito, alinhamento à esquerda (regra b),
    espaçamento leve para separar visualmente — mesmo padrão do relatório final,
    já que a regra b.8 (0/0) é tratada como o parcial trata: convenção já aceita."""
    return (f'<w:p><w:pPr><w:spacing w:before="120" w:after="60" w:line="240"/>'
            f'<w:jc w:val="left"/></w:pPr>{run(text, 20, bold=True)}</w:p>')

def body(text, indent=True):
    """Parágrafo de corpo: Arial 10, justificado, recuo de 1,25 cm (709 twips)."""
    ind = '<w:ind w:firstLine="709"/>' if indent else ""
    return (f'<w:p><w:pPr><w:widowControl/><w:spacing w:before="0" w:after="0" w:line="240"/>'
            f'{ind}<w:jc w:val="both"/></w:pPr>{run(text, 20)}</w:p>')

def ref(text):
    """Referências: ABNT NBR 6023, justificado, sem recuo de primeira linha
    (entrada bibliográfica alinhada à esquerda do bloco)."""
    return body(text, indent=False)

# ── monta o novo conjunto de parágrafos ──────────────────────────────────────
titulo = read_one("titulo")
autores = read_one("autores")
palavras = read_one("palavraschave")

new_paras = []
new_paras.append(para_special(titulo, 24, True, "center"))          # [2] título
new_paras.append(para_blank(24))                                     # [3] espaço 12pt
new_paras.append(para_special(autores, 22, False, "center"))         # [4] autores
new_paras.append(para_blank(22))                                     # [5] espaço 11pt
new_paras.append(para_special(palavras, 20, False, "left"))          # [7] palavras-chave
new_paras.append(para_blank(20))                                     # [8] espaço 10pt
new_paras.append(para_blank(20))                                     # [9] espaço 10pt

sections = [
    ("1. Introdução",          read_paras("introducao")),
    ("2. Metodologia",         read_paras("metodologia")),
    ("3. Resultados e discussão", read_paras("resultados")),
    ("4. Conclusão",           read_paras("conclusao")),
]
for title, paras in sections:
    new_paras.append(heading(title))
    for p in paras:
        new_paras.append(body(p))

new_paras.append(heading("5. Referências"))
for p in read_paras("referencias"):
    new_paras.append(ref(p))

new_paras.append(heading("6. Apoio"))
for p in read_paras("apoio"):
    new_paras.append(body(p))

# ── aplica no document.xml original ─────────────────────────────────────────
xml = DOC.read_text(encoding="utf8")
body_start = xml.index("<w:body>") + len("<w:body>")
body_end = xml.index("<w:sectPr>")
head, tail = xml[:body_start], xml[body_end:]
old_body = xml[body_start:body_end]
old_paras = re.findall(r'<w:p\b.*?</w:p>', old_body, re.S)
assert len(old_paras) == 49, f"esperava 49 parágrafos, achei {len(old_paras)}"

# preserva os dois parágrafos em branco do topo (índices 0 e 1) e descarta tudo
# a partir do índice 22 ("Da formatação do documento:" em diante) — instruções
# do modelo, não conteúdo a submeter.
kept_prefix = old_paras[0:2]

final_paras = kept_prefix + new_paras
new_body_xml = "".join(final_paras)
DOC.write_text(head + new_body_xml + tail, encoding="utf8")

print(f"parágrafos originais mantidos no topo: {len(kept_prefix)}")
print(f"parágrafos novos: {len(new_paras)}")
print(f"parágrafos descartados (instruções): {49 - len(kept_prefix)}")

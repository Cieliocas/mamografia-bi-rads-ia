# Verificação — Spec 002

**Data:** 2026-08-30 · **Branch:** `feat/spec-001-sidecar-onnx`
**Imagens:** mamografias reais do exame Siemens Mammomat Inspiration (MG, 2800×3518, 12 bits)

---

## Critérios de aceite

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| CA-01 | Caixa desenhada sobre a lesão, em 3 DICOMs distintos | ✅ | Conferido em <incidência> (R-MLO), <incidência> (L-MLO) e <incidência> (R-CC) |
| CA-02 | Zoom e pan mantêm a caixa ancorada | ✅ | 16% → 20%: caixas escalaram com a imagem, sem deriva |
| CA-03 | "Aceitar" cria ROI editável e persistível | ✅ | Vira contorno sólido na cor do BI-RADS, sai da lista, `ROIs: 1`, botão Salvar habilita |
| CA-04 | "Rejeitar" remove a caixa sem criar ROI | ✅ | Caixa some do canvas, contagem de ROIs inalterada |
| CA-05 | Gate fechado → faixa nível-imagem, sem retângulo | ✅ | `P=0.004`, cartão "Avaliação da imagem", canvas limpo |
| CA-06 | Avisos RF-10 e RF-11 presentes e não dispensáveis | ✅ | Faixa âmbar permanente + faixa rosa de gate fechado, nenhuma com botão de fechar |
| CA-07 | Trocar de imagem limpa as sugestões | ✅ | Ao abrir <incidência>, bloco de IA e caixas desaparecem |
| CA-08 | `ng build` sem erro nem warning de tipo | ✅ | Bundle 493 kB, build limpo |

Extra: **41 testes de frontend passando** (33 antes + 8 novos em `types.spec.ts`).

## Como as sugestões aparecem

- **Pendente:** retângulo **tracejado ciano** (`#22d3ee`), fora da paleta BI-RADS, com
  rótulo `IA · <kind> <conf>%`. Desenhado **abaixo** das marcações do radiologista,
  para nunca encobrir trabalho validado.
- **Aceita:** vira ROI sólida, na cor do BI-RADS, rotulada `IA: <kind>`. A mudança
  visual é o feedback de que a sugestão passou a ser marcação validada.
- **Editada:** idem, já selecionada (halo violeta), o usuário cai direto no ajuste.
- **Rejeitada:** sai do canvas; o registro fica em memória para a Spec 003.
- **`assessment`:** nunca vira retângulo. Vai para o painel como avaliação
  nível-imagem com `P(maligno)`.

## Ressalva importante sobre esta verificação

**As caixas de CA-01 a CA-04 vieram do backend `mock`, não da cascata real.**

Não é um atalho — é consequência do dado disponível. As quatro mamografias do
exame são de um caso **verdadeiramente negativo** (laudo: ACR BI-RADS 2, achados
benignos), e o detector se manteve **silencioso** nelas mesmo com o gate forçado
totalmente aberto e o limiar de detecção em `DET_CONF=0.005`:

| Vista | Cascata real, gate forçado 0.0 e DET_CONF 0.005 |
|---|---|
| R-CC | `assessment` P=0,010 — nenhuma caixa |
| L-CC | `assessment` P=0,034 — nenhuma caixa |
| R-MLO | `assessment` P=0,004 — nenhuma caixa |
| L-MLO | `assessment` P=0,012 — nenhuma caixa |

Isso é **coerente com o laudo**, e é um resultado em si: o detector não inventou
achados num exame normal. Mas significa que, com este conjunto, não há como
produzir uma caixa real para exercitar aceitar/editar/rejeitar.

Então o ciclo foi verificado com as caixas do mock **sobre a mamografia real
exibida no viewer** — o que valida o caminho completo (geometria, escala, ancoragem,
conversão em ROI, persistência habilitada), mas **não** a qualidade da detecção.

**Consequência para a Spec 004:** um exame com achado positivo é agora requisito, não
conveniência. Sem ele, a única coisa demonstrável do detector é que ele fica quieto
quando deve — metade do sistema.

## Decisão de escopo registrada

A `ROI` ganhou os campos de proveniência (`source`, `modelId`, `aiConfidence`,
`aiKind`, `aiBirads`, `aiBbox`) já nesta spec, preenchidos no aceite, embora a
**persistência** deles seja da Spec 003. Alternativa seria criar a ROI sem
proveniência agora e reabrir `acceptFinding` depois — pior: a geometria original
sugerida se perderia no instante exato em que ela passa a existir. Aqui a Spec 002
só deixa de jogar fora o dado; a Spec 003 o grava.

## O que ficou de fora (declarado na spec)

Aceitar todos de uma vez · ajuste do limiar do gate pela UI · sobreposição de
máscara de segmentação (os modelos entregam caixas) · comparação lado a lado entre
sugestão e anotação salva.

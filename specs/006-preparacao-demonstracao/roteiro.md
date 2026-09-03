# Roteiro de demonstração — AIdentify

**Duração:** 12 a 15 minutos · **Público:** médico radiologista
**Objetivo:** mostrar a ferramenta de anotação e o ciclo semiautomático, sem
sugerir capacidade diagnóstica que ela não tem.

---

## Antes de começar (5 minutos, sem plateia)

```bash
bash tools/check_demo.sh
```

**Só prossiga com PRONTO PARA DEMONSTRAR.** Se aparecer qualquer falha, resolva
antes: demonstrar em modo simulado significa exibir achados inventados a um
profissional. A aplicação sinaliza isso na tela, mas a conversa já terá sido
contaminada.

```bash
bash tools/run_demo.sh
```

Abre o **aplicativo empacotado** (`AIdentify.app`) já apontado para os modelos
reais, e recusa abrir se a verificação falhar. Só imprime "Pronto" com
`ai_model: real`.

Alternativa, em modo de desenvolvimento: `bash tools/run_desktop_dev.sh`.

Confira na barra inferior: **não** pode haver o aviso `▲ IA SIMULADA`.

Tenha aberto: um exame de mamografia em DICOM (idealmente as quatro incidências)
e, se possível, o laudo correspondente — a comparação no fim é o momento mais
forte da demonstração.

---

## 1. O problema (1 min, sem tocar no computador)

> "A anotação de achados é o gargalo para construir base de dados de qualidade.
> Exige tempo de quem é escasso: o senhor. Esta ferramenta não tenta substituir
> essa leitura — ela tenta reduzir o trabalho mecânico e registrar o que o
> senhor decide, de um jeito que sirva depois para melhorar o próprio modelo."

Não abra com a IA. Abra com o problema.

## 2. Abrir o exame (2 min)

- Painel **Files** → navegar até a pasta do exame (trilha clicável no topo)
- Clicar numa incidência

**Aponte:** dimensões reais (2800 × 3518), janelamento WW/WC vindo do próprio
cabeçalho DICOM, régua já calibrada em milímetros pelo *pixel spacing*.

> "Ele lê o DICOM direto do CD, inclusive comprimido, sem depender de conversor
> externo. E o exame é lido da máquina — nada sai daqui."

- Navegar entre as incidências com `←` / `→`
- Painel **DICOM**: mostrar os metadados completos

## 3. Anotação manual (2 min)

- Ferramenta ROI (`R`) → marcar uma região
- Atribuir BI-RADS no painel da direita
- Régua (`L`) → medir; mostrar o valor em milímetros
- Lupa (`M`) sobre uma região de interesse

> "Isto é o que o senhor já faria. O objetivo é que seja rápido."

Se houver tempo: nota de voz no achado.

## 4. O ciclo semiautomático (3 min) — o centro da demonstração

- Botão **Rodar IA**

**Diga antes de aparecer o resultado**, não depois:

> "São dois modelos de pesquisa, treinados em bases públicas por um colega de
> iniciação científica. Não são validados clinicamente e não substituem leitura.
> O que quero mostrar é o fluxo, não o acerto."

**Se aparecerem caixas:**
- Aponte o traço tracejado: sugestão pendente, não marcação
- **Aceitar** → vira anotação sólida, na cor do BI-RADS
- **Editar** → aceitar e ajustar; explique que a caixa original é guardada
- **Rejeitar** → descarta

**Se não aparecer caixa** (comum em exame normal — foi o que aconteceu na
avaliação): aponte a faixa de aviso e leia em voz alta:

> "Ausência de marcação não indica ausência de lesão. O classificador não
> sinaliza cerca de 31% dos casos malignos. Isso está escrito na tela de
> propósito."

Esse é o momento mais importante para a credibilidade da ferramenta.

## 5. Laudo (2 min)

- Painel **Laudo**: BI-RADS global, densidade ACR, conclusão, recomendação, assinatura
- Gerar **PDF** — abre com a imagem anotada embutida

> "O laudo sai com a imagem marcada. Tudo gerado localmente."

## 6. O que isso vira depois (2 min) — o argumento tecnológico

- Painel **Exportar dados** → mostrar o COCO

> "Cada anotação guarda de onde veio: se o senhor desenhou do zero, se aceitou a
> sugestão, se **corrigiu**, ou se **rejeitou**. Quando corrige, a ferramenta
> guarda as duas caixas — a que o modelo propôs e a que o senhor marcou.
>
> Essa diferença é a informação mais valiosa que existe aqui: ela diz onde o
> modelo errou, coisa que uma anotação nova não diz. E a rejeição é um falso
> positivo rotulado.
>
> A limitação hoje é falta de dado anotado. Esta ferramenta é a máquina de
> produzir esse dado."

## 7. Perguntas e limitações (2 min)

Declare antes de ser perguntado:

- Não houve validação clínica; a avaliação usou 4 imagens de um exame
- O BI-RADS sugerido pela IA é estimativa heurística, não classificação validada
- O detector foi treinado só em vistas MLO de uma base chinesa; fora desse
  domínio o desempenho cai
- Latência de inferência: menos de 1 segundo por imagem

**Pergunte:** o que falta para isso ser útil na rotina dele? Quais achados ele
mais gostaria de ver sugeridos? Anote — é insumo direto para o próximo ciclo.

---

## Se algo der errado

| Sintoma | Ação |
|---|---|
| `▲ IA SIMULADA` na barra | **Pare a parte de IA.** Diga que o modelo não carregou e siga pela anotação manual. Nunca apresente achado sintético como resultado |
| Imagem não abre | Verifique se é DICOM (`file` no terminal); alguns CDs trazem formatos proprietários |
| Inferência demora | Normal na primeira execução (carga dos modelos). A partir da segunda, menos de 1 s |
| Go Core offline | `bash tools/run_desktop_dev.sh --rebuild-go` |

## Nunca faça

- Demonstrar em modo simulado sem dizer explicitamente que é simulado
- Chamar o BI-RADS da IA de "classificação" — é estimativa
- Apresentar concordância com um laudo como validação
- Deixar o painel de pacientes visível numa captura de tela — expõe o identificador

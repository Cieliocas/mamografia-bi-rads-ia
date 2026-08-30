# Verificação — Spec 004

**Data:** 2026-08-30 · Resultados completos em [`resultados.md`](resultados.md)

---

## Critérios de aceite

| # | Critério | Resultado |
|---|---|---|
| CA-01 | N ≥ 20 imagens processadas com a cascata real | ❌ **Não atendido** — 4 mamografias reais + 2 fixtures. Ver §7 de `resultados.md` |
| CA-02 | Métricas RF-03 a RF-11 preenchidas | ⚠️ **Parcial** — RF-03 a RF-10 medidas; **RF-11 não é mensurável** neste conjunto (sem sugestões com região) |
| CA-03 | Ao menos 5 capturas de qualidade publicável | ⚠️ **Parcial** — 2 figuras renderizadas; ver nota abaixo |
| CA-04 | Limitações registradas com honestidade | ✅ §6 de `resultados.md`, incluindo os dois defeitos em aberto |

**Esta spec não está concluída.** Fica bloqueada num insumo que não é de
engenharia: mais exames, e ao menos um com achado positivo.

## Entregáveis

| # | Item | Estado |
|---|---|---|
| E-01 | [`resultados.md`](resultados.md) | ✅ |
| E-02 | [`dados/medicoes.csv`](dados/medicoes.csv) + [`dados/bateria.py`](dados/bateria.py) reexecutável | ✅ |
| E-03 | Figuras do ciclo | ⚠️ 2 de 5 — [`fig_ciclo_semiautomatico.png`](dados/fig_ciclo_semiautomatico.png), [`fig_gate_fechado.png`](dados/fig_gate_fechado.png) |
| E-04 | [`dados/exemplo_export_coco.json`](dados/exemplo_export_coco.json) com proveniência | ✅ |

### Nota sobre as figuras

Foram **renderizadas programaticamente** a partir do DICOM real, não capturadas
da interface. O motivo é de privacidade: a tela do aplicativo exibe o
`PatientID` do exame no painel de pacientes, e uma captura o levaria para o
relatório. As figuras contêm apenas pixels e as anotações desenhadas.

A `fig_ciclo_semiautomatico.png` traz **tarja de figura ilustrativa**: as caixas
foram posicionadas para demonstrar o ciclo, porque a cascata **não** detectou
achados neste exame. Apresentá-la sem essa tarja seria sugerir uma detecção que
não houve.

A `fig_gate_fechado.png` é resultado **real** medido (`P = 0,004`).

Capturas da própria interface, se necessárias ao relatório, devem ser feitas com
o painel de pacientes fechado.

## Privacidade

O exame é de paciente real e identificável. Nada dele entrou no repositório:

- `medicoes.csv` — rótulos de vista, dimensões e tempos; sem identificadores.
- `exemplo_export_coco.json` — nomes de arquivo substituídos por `estudo_NNN.dcm`;
  verificado sem ocorrências de `patient`, do PatientID ou do nome do exame.
- Figuras — pixels e desenhos apenas.

> **Alerta que permanece:** o export *padrão* da aplicação inclui `patient_id`,
> vindo do PatientID do DICOM. Qualquer envio a terceiros — inclusive ao parceiro,
> para retreino — exige pseudonimização dessa coluna. Não implementado: está fora
> do escopo declarado das specs 003 e 004.

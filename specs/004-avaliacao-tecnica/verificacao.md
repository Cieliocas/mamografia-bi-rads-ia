# Verificação — Spec 004

**Data:** 2026-08-30 · Resultados completos em [`resultados.md`](resultados.md)

---

## Critérios de aceite

| # | Critério | Resultado |
|---|---|---|
| CA-01 | N ≥ 20 imagens processadas com a cascata real | ❌ **Não atendido** — 4 mamografias reais + 2 fixtures. Ver §7 de `resultados.md` |
| CA-02 | Métricas RF-03 a RF-11 preenchidas | ⚠️ **Parcial** — RF-03 a RF-10 medidas; **RF-11 não é mensurável** neste conjunto (sem sugestões com região) |
| CA-03 | Ao menos 5 capturas de qualidade publicável | ❌ **Não atendido** — as figuras foram removidas por sigilo (ver nota) |
| CA-04 | Limitações registradas com honestidade | ✅ §6 de `resultados.md`, incluindo os dois defeitos em aberto |

**Esta spec não está concluída.** Fica bloqueada num insumo que não é de
engenharia: mais exames, e ao menos um com achado positivo.

## Entregáveis

| # | Item | Estado |
|---|---|---|
| E-01 | [`resultados.md`](resultados.md) | ✅ |
| E-02 | [`dados/medicoes.csv`](dados/medicoes.csv) + [`dados/bateria.py`](dados/bateria.py) reexecutável | ✅ |
| E-03 | Figuras do ciclo | ❌ **Removido** — imagens de exame não são publicáveis (sigilo) |
| E-04 | [`dados/exemplo_export_coco.json`](dados/exemplo_export_coco.json) com proveniência | ✅ |

### Nota sobre as figuras

**As figuras foram removidas do repositório e do relatório final por decisão de
sigilo do orientando.** As mamografias utilizadas na avaliação são de paciente
identificável, e o foco do plano de trabalho é a ferramenta, não o caso clínico.

O que as figuras ilustrariam — a distinção visual entre sugestão pendente e
marcação validada, e a avaliação em nível de imagem quando o classificador não
aciona o detector — está descrito em texto nas Seções 4.3 e 4.4 do relatório.

> **Atenção:** os arquivos chegaram a ser versionados no commit `de3149a7` e
> removidos em seguida. `git rm` não apaga o histórico: enquanto esse commit
> existir, as imagens permanecem recuperáveis do repositório local e de qualquer
> cópia publicada. Ver §Privacidade.

## Privacidade

O exame é de paciente real e identificável. Nada dele entrou no repositório:

- `medicoes.csv` — rótulos de vista, dimensões e tempos; sem identificadores.
- `exemplo_export_coco.json` — nomes de arquivo substituídos por `estudo_NNN.dcm`;
  verificado sem ocorrências de `patient`, do PatientID ou do nome do exame.
- Figuras — **removidas**; nenhuma permanece na árvore de trabalho.

### Pendência de histórico

As duas figuras foram introduzidas em `de3149a7` e removidas depois. O histórico
do Git as preserva. Como o objetivo é sigilo, e não apenas ausência na versão
atual, **o histórico precisa ser reescrito antes de qualquer publicação do
repositório** — por exemplo com `git filter-repo --path specs/004-avaliacao-tecnica/dados --invert-paths`,
ou concentrando os commits desta branch num único commit já sem os arquivos.
Enquanto isso não for feito, a branch não deve ser enviada ao remoto.

> **Alerta que permanece:** o export *padrão* da aplicação inclui `patient_id`,
> vindo do PatientID do DICOM. Qualquer envio a terceiros — inclusive ao parceiro,
> para retreino — exige pseudonimização dessa coluna. Não implementado: está fora
> do escopo declarado das specs 003 e 004.

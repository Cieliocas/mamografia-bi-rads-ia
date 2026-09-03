# Constituição do Projeto — AIdentify

> **Status:** vigente a partir de 2026-08-30
> **Escopo:** vale para todas as specs em `specs/`. Uma spec que conflite com este
> documento está errada — corrija a spec, não a constituição.

Este documento existe por um motivo prático: o projeto tem histórico de escopo
expandindo (30+ planos ad-hoc de A a AE) e de documentação divergindo do código.
Os princípios abaixo são o critério de corte para aceitar ou rejeitar qualquer
trabalho no período de fechamento.

---

## Princípios invioláveis

### P1 — Offline-first e LGPD por construção
Nenhum dado de paciente sai do dispositivo. Toda comunicação entre UI, Go Core e
sidecar de IA ocorre em `127.0.0.1`. Sem telemetria, sem analytics, sem dependência
de nuvem. Imagens de mamografia são dado pessoal sensível de saúde
(Lei 13.709/2018, Art. 11) — o tratamento é local e exclusivo do profissional.

### P2 — Apoio, não diagnóstico
A ferramenta é de **anotação assistida**. Todo achado produzido por modelo é uma
**sugestão sujeita a validação humana**, nunca uma decisão. Os modelos integrados
são modelos de pesquisa, **não validados clinicamente**. Este aviso é obrigatório
na interface e em qualquer material publicado.

### P3 — BI-RADS de IA é heurístico e deve ser rotulado como tal
O `birads` devolvido pelo sidecar é uma faixa derivada da probabilidade de
malignidade — **não** é um classificador BI-RADS validado. A UI nunca o apresenta
com o mesmo peso visual do BI-RADS preenchido pelo radiologista.

### P4 — Ausência de caixa nunca significa ausência de lesão
O classificador que atua como *gate* da cascata tem sensibilidade ≈ 0,69 no CMMD:
perde cerca de 31% dos casos malignos, e quando o gate fecha o detector nem é
acionado. A interface precisa comunicar isso explicitamente. Silenciar essa
limitação é um risco clínico, não uma escolha de UX.

### P5 — O contrato do sidecar é imutável sem alinhamento bilateral
`FindingResponse` (`task_id`, `model_id`, `findings[]`, `elapsed_ms`) e o cabeçalho
`X-Local-Token` são fronteira entre dois autores e dois repositórios. Renomear
campo de um lado sem o outro quebra a integração em silêncio. Mudança de contrato
exige alteração conjunta em `apps/core/internal/adapters/ai_client/client.go` e no
sidecar Python.

### P6 — Toda anotação persistida carrega proveniência
Não existe anotação anônima quanto à origem. Toda anotação gravada registra se
nasceu de sugestão de IA ou de marcação manual, qual modelo a produziu, com que
confiança, e qual era a geometria original antes de qualquer correção humana.
Sem isso, o dado gerado pela ferramenta não serve para retreino — que é a
justificativa tecnológica do projeto.

### P7 — Nada entra sem critério de aceite verificável
Toda spec declara critérios de aceite objetivos e checáveis. "Melhorar a UX" não é
critério. "O achado da IA aparece desenhado sobre a imagem na posição correta,
verificado em 3 DICOMs distintos" é.

---

## Regras de processo (período de fechamento)

1. **`origin/main` é a única fonte de verdade sobre o estado do código.**
   Documentos em `relatorios/` datados de abril/maio descrevem um estado morto e
   não devem ser usados para planejar nada.
2. **Documento que contradiz o código é bug.** `docs/ARCHITECTURE.md` e
   `CHANGELOG.md` são corrigidos junto com a mudança que os invalida, não depois.
3. **Uma spec, uma branch, um PR.** Cada diretório `specs/NNN-*` corresponde a uma
   unidade entregável e verificável de forma independente.
4. **Atribuição de autoria é obrigatória.** Código e modelos de terceiros
   (notadamente o sidecar e os modelos de Micaías Carvalho Vieira) são creditados
   no código, no README e no relatório final.

---

## Definição de pronto

Uma spec está concluída quando, e somente quando:

- [ ] Todos os critérios de aceite do `spec.md` foram verificados manualmente
- [ ] O código compila e os testes existentes passam (`go test ./...`, `pytest`, `ng build`)
- [ ] A documentação afetada (`docs/`, `CHANGELOG.md`) foi atualizada no mesmo PR
- [ ] Nenhum princípio P1–P7 foi violado

---

## Explicitamente fora de escopo no fechamento

Registrado aqui para que não volte a aparecer como "só mais uma coisinha":

| Fora de escopo | Motivo |
|---|---|
| Validação clínica com radiologistas | Não há tempo hábil nem aprovação ética no período; fica como trabalho futuro declarado no relatório |
| Retreino efetivo dos modelos com os dados coletados | Responsabilidade do plano de trabalho de Micaías; a ferramenta entrega o *dado*, não o treino |
| Análise estatística das divergências IA × humano | Decisão explícita: grava-se e exporta-se a proveniência; a análise fica para o pós-relatório |
| Integração RIS/PACS, DICOM SR, multi-tenant | Roadmap de longo prazo, sem relação com a entrega do PIBITI |
| Fine-tuning ou troca de modelos | Domínio do parceiro; o app trata o modelo como artefato substituível |
| Novas ferramentas de viewer | O viewer já excede o necessário para a proposta |

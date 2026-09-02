# Plano 006 — Preparação para demonstração

Ordem de execução por risco, não por esforço. As tarefas P0 precedem qualquer
demonstração; as P1 decidem se a demonstração pode sair desta máquina.

---

## P0 — Honestidade da demonstração ✅ concluído

### T1. Distinguir modelo carregado de serviço no ar
- [x] `ai_client` passa a expor `model_loaded` do `/health` do serviço
- [x] `/readyz` do Go Core ganha campo próprio (ex.: `ai_model: real | mock | none`)
- [x] `startup/status` idem, para a splash não liberar prometendo o que não há

### T2. Tornar o modo simulado visível na interface
- [x] `StudyService` deriva um sinal `aiSimulated` de `model_id` e do novo campo
- [x] Barra de estado: "IA simulada" em cor de advertência, no lugar de "IA disponível"
- [x] Painel de achados: faixa não dispensável, acima dos cartões, declarando que
      os achados são sintéticos e não provêm de modelo treinado
- [x] Visualizador: caixas em modo simulado recebem hachura ou rótulo "SIMULADO"
- [x] Teste de frontend cobrindo o sinal e a exibição da faixa

### T3. Verificação prévia de demonstração
- [x] `tools/check_demo.sh` — confere `.onnx` presentes e com checksum correto,
      venv com onnxruntime, Go Core compilado, e imprime PRONTO ou o que falta
- [x] Executado antes de cada demonstração

## P1 — Demonstração fora desta máquina 🔴

### T4. Decidir a estratégia de distribuição
Duas saídas; escolher uma antes de codar:
- **(a) Autocontido** — embutir Python e os `.onnx` no `.app`. Resolve de vez,
  mas o bundle passa de 500 MB e exige cuidado com assinatura.
- **(b) Pré-requisito verificado** — o app detecta a ausência na primeira execução
  e instrui, em vez de cair para o modo simulado. Muito mais barato; não resolve
  distribuição real.

Para a demonstração desta semana, **(b) basta**. (a) fica declarado como trabalho futuro.

- [ ] T4.1 Implementar a verificação de pré-requisitos no arranque
- [ ] T4.2 Tela ou faixa explicando o que instalar, sem jargão de terminal
- [ ] T4.3 `build_release.sh` documenta explicitamente o que NÃO empacota

## P2 — Usabilidade da demonstração 🟡

### T5. Navegação de pastas
- [ ] Entrada `..` no topo da listagem, limitada ao `$HOME`
- [ ] Trilha de navegação clicável a partir do caminho atual
- [ ] Teste no Go cobrindo o limite do `$HOME`

### T6. Roteiro de demonstração
- [ ] `specs/006-preparacao-demonstracao/roteiro.md` — 10 a 15 minutos, passo a passo,
      com o que dizer sobre as limitações em cada etapa

## P3 — Privacidade e saneamento 🟢

### T7. Pseudonimização na exportação
- [ ] `patient_id` substituído por hash estável (ex.: SHA-256 truncado do id + sal local)
- [ ] Parâmetro `?identified=true` para exportar identificado, com padrão seguro
- [ ] Teste cobrindo que o PatientID não aparece no export padrão

### T8. Saneamento
- [ ] `CHANGELOG.md`: corrigir `POST /api/export/backup` → `GET /api/backup` e
      `POST /api/import/restore` → `POST /api/restore`
- [ ] Registrar decisão sobre `study_id` no `ON CONFLICT`
- [ ] **Reescrever o histórico do Git** para remover as figuras (exige confirmação
      do orientando — operação irreversível)

---

## Sequência recomendada

```
T1 → T2 → T3        (P0: um dia)
T4.1 → T4.2 → T4.3  (P1: meio dia)
T5 → T6             (P2: meio dia)
T7 → T8             (P3: meio dia)
                    → build de release → abrir para teste
```

O build só acontece depois de P0 e P1. P2 e P3 podem ser cortados se o prazo
apertar, com a ressalva de que T7 é pré-requisito para enviar qualquer export
ao parceiro.

## Arquivos afetados (previsão)

```
apps/core/internal/adapters/ai_client/client.go        (model_loaded no health)
apps/core/internal/adapters/http/health_handler.go     (readyz distingue modelo)
apps/core/internal/adapters/http/fs_handler.go         (diretório-pai)
apps/core/internal/application/usecase/export_dataset.go (pseudonimização)
apps/frontend/src/app/core/services/study.service.ts   (sinal aiSimulated)
apps/frontend/src/app/features/annotations/*           (faixa de alerta)
apps/frontend/src/app/features/viewer/viewer.component.ts (marcação simulada)
apps/frontend/src/app/features/files/files-panel.*     (navegação)
tools/check_demo.sh                                    (novo)
tools/build_release.sh                                 (documentar limites)
CHANGELOG.md
```

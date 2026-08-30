# Plano 003 — Proveniência da anotação e exportação para retreino

> Implementa `spec.md` desta pasta.

---

## Fase 1 — Esquema do banco

O repositório já tem migração versionada com `embed` e tabela `schema_migrations`
(`apps/core/internal/adapters/sqlite/study_repository.go`, função `migrate`).
As migrações vão de `001_initial.sql` a `006_study_density.sql` — a próxima é a 007.

- [ ] **T1.1** Criar `apps/core/internal/adapters/sqlite/migrations/007_annotation_provenance.sql`:

```sql
ALTER TABLE annotations ADD COLUMN source        TEXT    NOT NULL DEFAULT 'manual';
ALTER TABLE annotations ADD COLUMN model_id      TEXT    NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN ai_confidence REAL    NOT NULL DEFAULT 0;
ALTER TABLE annotations ADD COLUMN ai_kind       TEXT    NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN ai_birads     TEXT    NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN ai_bbox       TEXT    NOT NULL DEFAULT '';
```

`ai_bbox` guarda o JSON `{"x":…,"y":…,"w":…,"h":…}` da sugestão original.
Os `DEFAULT` garantem a retrocompatibilidade exigida por RF-05/CA-05 sem
backfill: toda linha pré-existente passa a ser `manual`.

## Fase 2 — Domínio e repositório

- [ ] **T2.1** Em `domain/entity/annotation.go`, adicionar ao `Annotation`:
      `Source AnnotationSource`, `ModelID`, `AIConfidence`, `AIKind`, `AIBirads`,
      `AIBBox *BoundingBox` — todos com `omitempty` no JSON
- [ ] **T2.2** Criar o tipo `AnnotationSource` com as constantes
      `manual`, `ai_accepted`, `ai_edited`, `ai_rejected`.
      Reaproveitar a nomenclatura de `entity.FindingSource`, que já existe e
      define `manual`/`ai` — este é o lugar onde aquele conceito finalmente
      chega ao dado persistido
- [ ] **T2.3** Estender o `INSERT ... ON CONFLICT` de `annotation_repository.go`
      (`Save`) com as seis colunas novas
- [ ] **T2.4** Estender o `SELECT` de `LoadByStudyID` e o `Scan` correspondente
- [ ] **T2.5** Anotação `ai_rejected` não tem geometria humana: garantir que
      `Kind`/`data` aceitem o caso e que a leitura não quebre

## Fase 3 — Transporte

- [ ] **T3.1** Estender o DTO de `POST /api/studies/:id/annotations`
      (`study_handler.go`) com os campos de proveniência
- [ ] **T3.2** No frontend, estender `ROI` em `shared/models/types.ts` com
      `source`, `modelId`, `aiConfidence`, `aiKind`, `aiBirads`, `aiBbox`
- [ ] **T3.3** Em `study.service.ts`, `saveAnnotations()` envia os campos novos
- [ ] **T3.4** Em `acceptFinding` / `editFinding` (Spec 002), preencher a
      proveniência no momento da criação da ROI — `ai_edited` quando a geometria
      divergir da sugerida no instante da gravação, `ai_accepted` quando idêntica
- [ ] **T3.5** `rejectFinding` acumula um registro de rejeição a ser enviado
      no próximo Salvar (RF-04)

## Fase 4 — Exportação

- [ ] **T4.1** Em `application/usecase/export_dataset.go`, incluir os campos de
      proveniência no `record` usado por JSON e CSV
- [ ] **T4.2** Em `writeCOCO`, adicionar os campos como atributos extras de cada
      anotação COCO (o formato admite chaves adicionais sem quebrar consumidores)
- [ ] **T4.3** Exportar um conjunto real e validar o JSON

## Fase 5 — Verificação

- [ ] **T5.1** Executar CA-01 a CA-07
- [ ] **T5.2** Teste de repositório cobrindo ida-e-volta da proveniência
      (o padrão já existe em `study_repository_test.go`)
- [ ] **T5.3** Abrir um `mammo.db` anterior à migração e confirmar CA-05

## Arquivos afetados

```
apps/core/internal/adapters/sqlite/migrations/007_annotation_provenance.sql  (novo)
apps/core/internal/domain/entity/annotation.go
apps/core/internal/adapters/sqlite/annotation_repository.go
apps/core/internal/adapters/http/study_handler.go
apps/core/internal/application/usecase/export_dataset.go
apps/frontend/src/app/shared/models/types.ts
apps/frontend/src/app/core/services/study.service.ts
apps/frontend/src/app/features/annotations/findings-panel.component.ts
```

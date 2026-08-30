-- Provenance of an annotation: where it came from, and what the model had
-- suggested before any human correction.
--
-- The pair (ai_bbox, geometry in `data`) is the retraining signal: a corrected
-- box says more than a fresh one, and a rejected suggestion is a false positive
-- worth as much as a true one. Without this, an annotation accepted from the AI
-- and one drawn from scratch are indistinguishable in the database.
--
-- Every column has a DEFAULT so rows written before this migration stay valid
-- and read back as 'manual' — no backfill needed.

ALTER TABLE annotations ADD COLUMN source        TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE annotations ADD COLUMN model_id      TEXT NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN ai_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE annotations ADD COLUMN ai_kind       TEXT NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN ai_birads     TEXT NOT NULL DEFAULT '';
-- JSON {"x":…,"y":…,"w":…,"h":…} in source-image pixels; '' when not AI-derived.
ALTER TABLE annotations ADD COLUMN ai_bbox       TEXT NOT NULL DEFAULT '';

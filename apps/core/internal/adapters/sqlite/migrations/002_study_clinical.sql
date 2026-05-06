-- Migration 002: clinical fields persisted at the study level so the report
-- can include radiologist conclusion, recommendation and a global BI-RADS.

ALTER TABLE studies ADD COLUMN birads_global TEXT NOT NULL DEFAULT '';
ALTER TABLE studies ADD COLUMN conclusion    TEXT NOT NULL DEFAULT '';
ALTER TABLE studies ADD COLUMN recommendation TEXT NOT NULL DEFAULT '';
ALTER TABLE studies ADD COLUMN signed_by      TEXT NOT NULL DEFAULT '';
ALTER TABLE studies ADD COLUMN signed_at      TEXT NOT NULL DEFAULT '';

-- Migration 006: ACR breast density (BI-RADS composition A-D) at the study
-- level. Required by BI-RADS 5th edition reporting. Empty string = not set.
ALTER TABLE studies ADD COLUMN birads_density TEXT NOT NULL DEFAULT '';

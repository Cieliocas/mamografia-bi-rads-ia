-- Add label and notes columns to annotations for free-text per-ROI data.
-- audio_transcript already exists from migration 004; we only add what's missing.
ALTER TABLE annotations ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN notes TEXT NOT NULL DEFAULT '';

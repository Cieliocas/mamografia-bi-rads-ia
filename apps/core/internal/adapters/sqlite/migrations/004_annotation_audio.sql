-- Migration 004: voice notes per annotation. Audio blobs live on disk under
-- ${MAMMO_LOCAL_ROOT}/audio/<study_id>/<annotation_id>.webm; the row stores
-- only the relative path, duration and an optional transcript.

ALTER TABLE annotations ADD COLUMN audio_path        TEXT NOT NULL DEFAULT '';
ALTER TABLE annotations ADD COLUMN audio_duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE annotations ADD COLUMN audio_transcript  TEXT NOT NULL DEFAULT '';

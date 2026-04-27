-- Migration 001: initial schema for studies, findings, and annotations.

CREATE TABLE IF NOT EXISTS studies (
    id          TEXT PRIMARY KEY,
    patient_id  TEXT NOT NULL DEFAULT '',
    study_date  TEXT NOT NULL DEFAULT '',
    modality    TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    file_path   TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
    id          TEXT PRIMARY KEY,
    study_id    TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    birads      TEXT NOT NULL,
    laterality  TEXT NOT NULL DEFAULT '',
    projection  TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
    id          TEXT PRIMARY KEY,
    study_id    TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    finding_id  TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL,   -- 'bounding_box' | 'polygon' | 'point'
    data        TEXT NOT NULL,   -- JSON blob of coordinates
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

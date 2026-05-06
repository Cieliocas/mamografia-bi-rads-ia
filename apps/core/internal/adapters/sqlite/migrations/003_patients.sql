-- Migration 003: Patient as a first-class entity. Until now patient_id was
-- just a string copied from the DICOM header; this introduces a real table
-- so the radiologist can edit names, group studies and search.

CREATE TABLE IF NOT EXISTS patients (
    id           TEXT PRIMARY KEY,            -- internal UUID
    external_id  TEXT NOT NULL DEFAULT '',    -- PatientID from DICOM (0010,0020)
    name         TEXT NOT NULL DEFAULT '',
    birth_date   TEXT NOT NULL DEFAULT '',    -- ISO YYYY-MM-DD
    sex          TEXT NOT NULL DEFAULT '',    -- 'F' | 'M' | 'O' | ''
    notes        TEXT NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_external_id ON patients(external_id);
CREATE INDEX IF NOT EXISTS idx_patients_name        ON patients(name);

-- Studies link to a patient row by UUID. Old rows keep their patient_id
-- string for backwards compat; new opens populate patient_uuid via
-- EnsurePatient.
ALTER TABLE studies ADD COLUMN patient_uuid TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_studies_patient_uuid ON studies(patient_uuid);

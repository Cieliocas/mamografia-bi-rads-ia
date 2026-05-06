package sqlite

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"mammo/apps/core/internal/domain/entity"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB opens (or creates) the SQLite database at path and runs migrations.
func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("sqlite migrate: %w", err)
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		name       TEXT PRIMARY KEY,
		applied_at DATETIME NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		var existing string
		err := db.QueryRow(`SELECT name FROM schema_migrations WHERE name = ?`, e.Name()).Scan(&existing)
		if err == nil {
			continue // already applied
		}

		data, err := migrationsFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		if _, err := db.Exec(string(data)); err != nil {
			return fmt.Errorf("migration %s: %w", e.Name(), err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations(name) VALUES(?)`, e.Name()); err != nil {
			return fmt.Errorf("record migration %s: %w", e.Name(), err)
		}
	}
	return nil
}

// StudyRepository is the SQLite implementation of ports/outbound.StudyRepository.
type StudyRepository struct {
	db *sql.DB
}

func NewStudyRepository(db *sql.DB) *StudyRepository {
	return &StudyRepository{db: db}
}

func (r *StudyRepository) Save(ctx context.Context, s *entity.Study) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO studies (id, patient_id, patient_uuid, study_date, modality, description, file_path,
		                    birads_global, conclusion, recommendation, signed_by, signed_at,
		                    created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			patient_id     = excluded.patient_id,
			patient_uuid   = excluded.patient_uuid,
			study_date     = excluded.study_date,
			description    = excluded.description,
			birads_global  = excluded.birads_global,
			conclusion     = excluded.conclusion,
			recommendation = excluded.recommendation,
			signed_by      = excluded.signed_by,
			signed_at      = excluded.signed_at`,
		string(s.ID),
		s.PatientID,
		s.PatientUUID,
		s.StudyDate.Format(time.RFC3339),
		"MG", // mammography modality constant for now
		"",
		s.FilePath,
		s.BiradsGlobal, s.Conclusion, s.Recommendation, s.SignedBy, s.SignedAt,
		s.CreatedAt.Format(time.RFC3339),
	)
	return err
}

const studyCols = `id, patient_id, patient_uuid, study_date, file_path,
	birads_global, conclusion, recommendation, signed_by, signed_at, created_at`

func (r *StudyRepository) FindByID(ctx context.Context, id string) (*entity.Study, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+studyCols+` FROM studies WHERE id = ?`, id)
	return scanStudy(row)
}

func (r *StudyRepository) List(ctx context.Context) ([]*entity.Study, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+studyCols+` FROM studies ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var studies []*entity.Study
	for rows.Next() {
		s, err := scanStudy(rows)
		if err != nil {
			return nil, err
		}
		studies = append(studies, s)
	}
	return studies, rows.Err()
}

func (r *StudyRepository) ListByPatient(ctx context.Context, patientUUID string) ([]*entity.Study, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+studyCols+` FROM studies WHERE patient_uuid = ? ORDER BY created_at DESC`,
		patientUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*entity.Study
	for rows.Next() {
		s, err := scanStudy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *StudyRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM studies WHERE id = ?`, id)
	return err
}

// scanner abstracts over *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanStudy(s scanner) (*entity.Study, error) {
	var study entity.Study
	var id, patientID, patientUUID, studyDate, filePath, biradsGlobal, conclusion, recommendation, signedBy, signedAt, createdAt string
	if err := s.Scan(&id, &patientID, &patientUUID, &studyDate, &filePath,
		&biradsGlobal, &conclusion, &recommendation, &signedBy, &signedAt, &createdAt); err != nil {
		return nil, err
	}
	study.ID = entity.StudyID(id)
	study.PatientID = patientID
	study.PatientUUID = patientUUID
	study.FilePath = filePath
	study.BiradsGlobal = biradsGlobal
	study.Conclusion = conclusion
	study.Recommendation = recommendation
	study.SignedBy = signedBy
	study.SignedAt = signedAt

	if t, err := time.Parse(time.RFC3339, studyDate); err == nil {
		study.StudyDate = t
	}
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		study.CreatedAt = t
	}
	return &study, nil
}

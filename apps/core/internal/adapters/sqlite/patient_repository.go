package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"mammo/apps/core/internal/domain/entity"
)

type PatientRepository struct {
	db *sql.DB
}

func NewPatientRepository(db *sql.DB) *PatientRepository {
	return &PatientRepository{db: db}
}

const patientCols = `id, external_id, name, birth_date, sex, notes, created_at`

func (r *PatientRepository) Save(ctx context.Context, p *entity.Patient) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO patients (`+patientCols+`)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			external_id = excluded.external_id,
			name        = excluded.name,
			birth_date  = excluded.birth_date,
			sex         = excluded.sex,
			notes       = excluded.notes`,
		string(p.ID), p.ExternalID, p.Name, p.BirthDate, p.Sex, p.Notes,
		p.CreatedAt.Format(time.RFC3339),
	)
	return err
}

func (r *PatientRepository) FindByID(ctx context.Context, id string) (*entity.Patient, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+patientCols+` FROM patients WHERE id = ?`, id)
	return scanPatient(row)
}

func (r *PatientRepository) FindByExternalID(ctx context.Context, externalID string) (*entity.Patient, error) {
	if externalID == "" {
		return nil, nil
	}
	row := r.db.QueryRowContext(ctx,
		`SELECT `+patientCols+` FROM patients WHERE external_id = ? ORDER BY created_at LIMIT 1`,
		externalID)
	p, err := scanPatient(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

func (r *PatientRepository) List(ctx context.Context, query string, limit int) ([]*entity.Patient, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var rows *sql.Rows
	var err error
	if query == "" {
		rows, err = r.db.QueryContext(ctx,
			`SELECT `+patientCols+` FROM patients ORDER BY created_at DESC LIMIT ?`, limit)
	} else {
		like := "%" + query + "%"
		rows, err = r.db.QueryContext(ctx,
			`SELECT `+patientCols+` FROM patients
			 WHERE name LIKE ? OR external_id LIKE ?
			 ORDER BY created_at DESC LIMIT ?`,
			like, like, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*entity.Patient
	for rows.Next() {
		p, err := scanPatient(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PatientRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM patients WHERE id = ?`, id)
	return err
}

func scanPatient(s scanner) (*entity.Patient, error) {
	var p entity.Patient
	var id, externalID, name, birthDate, sex, notes, createdAt string
	if err := s.Scan(&id, &externalID, &name, &birthDate, &sex, &notes, &createdAt); err != nil {
		return nil, err
	}
	p.ID = entity.PatientID(id)
	p.ExternalID = externalID
	p.Name = name
	p.BirthDate = birthDate
	p.Sex = sex
	p.Notes = notes
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		p.CreatedAt = t
	}
	return &p, nil
}

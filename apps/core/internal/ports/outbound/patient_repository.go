package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// PatientRepository persists and queries Patient entities.
type PatientRepository interface {
	Save(ctx context.Context, p *entity.Patient) error
	FindByID(ctx context.Context, id string) (*entity.Patient, error)
	// FindByExternalID returns the first patient matching the given DICOM
	// PatientID. Returns (nil, nil) when nothing matches (not an error).
	FindByExternalID(ctx context.Context, externalID string) (*entity.Patient, error)
	List(ctx context.Context, query string, limit int) ([]*entity.Patient, error)
	Delete(ctx context.Context, id string) error
}

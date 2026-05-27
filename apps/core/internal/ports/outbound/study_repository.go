package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// StudyRepository persists and retrieves Study aggregates.
type StudyRepository interface {
	Save(ctx context.Context, study *entity.Study) error
	FindByID(ctx context.Context, id string) (*entity.Study, error)
	// FindByFilePath returns the most recent study associated with the given
	// filesystem path, or (nil, nil) when no match exists.
	FindByFilePath(ctx context.Context, filePath string) (*entity.Study, error)
	List(ctx context.Context) ([]*entity.Study, error)
	ListByPatient(ctx context.Context, patientUUID string) ([]*entity.Study, error)
	Delete(ctx context.Context, id string) error
}

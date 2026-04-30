package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// StudyRepository persists and retrieves Study aggregates.
type StudyRepository interface {
	Save(ctx context.Context, study *entity.Study) error
	FindByID(ctx context.Context, id string) (*entity.Study, error)
	List(ctx context.Context) ([]*entity.Study, error)
	Delete(ctx context.Context, id string) error
}

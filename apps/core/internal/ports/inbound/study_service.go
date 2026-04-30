package inbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// StudyService is the inbound port consumed by HTTP handlers.
// Use cases implement this interface; handlers depend on it.
type StudyService interface {
	OpenStudy(ctx context.Context, filePath string) (*entity.Study, error)
	GetStudy(ctx context.Context, id string) (*entity.Study, error)
	ListStudies(ctx context.Context) ([]*entity.Study, error)
	SaveAnnotations(ctx context.Context, studyID string, annotations []*entity.Annotation) error
	LoadAnnotations(ctx context.Context, studyID string) ([]*entity.Annotation, error)
}

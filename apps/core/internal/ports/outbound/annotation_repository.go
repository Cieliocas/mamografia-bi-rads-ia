package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// AnnotationRepository persists and retrieves Annotation slices keyed by study.
type AnnotationRepository interface {
	Save(ctx context.Context, annotation *entity.Annotation) error
	LoadByStudyID(ctx context.Context, studyID string) ([]*entity.Annotation, error)
	DeleteByStudyID(ctx context.Context, studyID string) error
}

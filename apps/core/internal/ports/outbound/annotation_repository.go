package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// AnnotationRepository persists and retrieves Annotation slices keyed by study.
type AnnotationRepository interface {
	Save(ctx context.Context, studyID string, annotation *entity.Annotation) error
	LoadByStudyID(ctx context.Context, studyID string) ([]*entity.Annotation, error)
	DeleteByStudyID(ctx context.Context, studyID string) error
	// DeleteByStudyIDExcept deletes all annotations for a study whose IDs are
	// NOT in the keep set. Used by SaveAnnotations to prune removed ROIs while
	// preserving audio attached to surviving ones.
	DeleteByStudyIDExcept(ctx context.Context, studyID string, keep map[string]struct{}) error
}

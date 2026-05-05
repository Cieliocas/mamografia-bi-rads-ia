package usecase

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// AnnotationDTO is used for JSON serialization in HTTP handlers.
type AnnotationDTO struct {
	Kind string  `json:"kind"`
	X    float64 `json:"x,omitempty"`
	Y    float64 `json:"y,omitempty"`
	W    float64 `json:"w,omitempty"`
	H    float64 `json:"h,omitempty"`
}

// SaveAnnotations persists a slice of annotations for a given study.
type SaveAnnotations struct {
	repo outbound.AnnotationRepository
}

func NewSaveAnnotations(repo outbound.AnnotationRepository) *SaveAnnotations {
	return &SaveAnnotations{repo: repo}
}

type SaveAnnotationsInput struct {
	StudyID     string          `json:"study_id"`
	Annotations []AnnotationDTO `json:"annotations"`
}

func (uc *SaveAnnotations) Execute(ctx context.Context, in SaveAnnotationsInput) error {
	if in.StudyID == "" {
		return fmt.Errorf("study_id is required")
	}
	if err := uc.repo.DeleteByStudyID(ctx, in.StudyID); err != nil {
		return fmt.Errorf("clear annotations: %w", err)
	}
	for _, dto := range in.Annotations {
		ann := dtoToEntity(dto)
		if err := uc.repo.Save(ctx, in.StudyID, ann); err != nil {
			return fmt.Errorf("save annotation: %w", err)
		}
	}
	return nil
}

// LoadAnnotations retrieves all annotations for a study.
type LoadAnnotations struct {
	repo outbound.AnnotationRepository
}

func NewLoadAnnotations(repo outbound.AnnotationRepository) *LoadAnnotations {
	return &LoadAnnotations{repo: repo}
}

type LoadAnnotationsOutput struct {
	Annotations []*entity.Annotation
}

func (uc *LoadAnnotations) Execute(ctx context.Context, studyID string) (*LoadAnnotationsOutput, error) {
	if studyID == "" {
		return nil, fmt.Errorf("study_id is required")
	}
	anns, err := uc.repo.LoadByStudyID(ctx, studyID)
	if err != nil {
		return nil, err
	}
	return &LoadAnnotationsOutput{Annotations: anns}, nil
}

func dtoToEntity(dto AnnotationDTO) *entity.Annotation {
	ann := &entity.Annotation{ID: entity.AnnotationID(uuid.NewString())}
	switch dto.Kind {
	case "polygon":
		ann.Kind = entity.AnnotationPolygon
		ann.Polygon = &entity.Polygon{}
	case "point":
		ann.Kind = entity.AnnotationPoint
		ann.Point = &entity.Point{X: dto.X, Y: dto.Y}
	default:
		ann.Kind = entity.AnnotationBoundingBox
		ann.BBox = &entity.BoundingBox{X: dto.X, Y: dto.Y, Width: dto.W, Height: dto.H}
	}
	return ann
}

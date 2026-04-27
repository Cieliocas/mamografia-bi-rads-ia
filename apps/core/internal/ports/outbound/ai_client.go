package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// FindingCandidates is the raw inference result from the AI sidecar.
type FindingCandidates struct {
	Findings []*entity.Finding
	ModelID  string
}

// AIClient dispatches an image to the inference sidecar.
type AIClient interface {
	Predict(ctx context.Context, imagePath string) (*FindingCandidates, error)
	HealthCheck(ctx context.Context) error
}

package outbound

import (
	"context"

	"mammo/apps/core/internal/domain/entity"
)

// BBox is a normalised bounding box in image-pixel coordinates.
type BBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// RichFinding augments entity.Finding with transport-layer fields
// (confidence, bounding box) returned by the sidecar.
type RichFinding struct {
	Finding    *entity.Finding
	BIRADS     string  `json:"birads"`
	Confidence float64 `json:"confidence"`
	BBox       BBox    `json:"bbox"`
	Notes      string  `json:"notes"`
}

// FindingCandidates is the raw inference result from the AI sidecar.
type FindingCandidates struct {
	Findings []*RichFinding
	ModelID  string
}

// AIClient dispatches an image to the inference sidecar.
type AIClient interface {
	Predict(ctx context.Context, imagePath string) (*FindingCandidates, error)
	HealthCheck(ctx context.Context) error
}

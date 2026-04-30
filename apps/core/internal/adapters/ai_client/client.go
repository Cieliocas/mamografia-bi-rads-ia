// Package ai_client is the outbound adapter that talks to the Python sidecar.
package ai_client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// HTTPClient implements outbound.AIClient over the FastAPI sidecar.
type HTTPClient struct {
	baseURL     string
	sharedToken string
	http        *http.Client
}

func New(baseURL, sharedToken string) *HTTPClient {
	return &HTTPClient{
		baseURL:     baseURL,
		sharedToken: sharedToken,
		http:        &http.Client{Timeout: 5 * time.Minute},
	}
}

func (c *HTTPClient) HealthCheck(_ context.Context) error {
	resp, err := c.http.Get(c.baseURL + "/health")
	if err != nil {
		return fmt.Errorf("ai health: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ai health: status %d", resp.StatusCode)
	}
	return nil
}

// ── wire types (mirror the Python FindingResponse schema) ────────────────────

type predictReq struct {
	ImagePath string `json:"image_path"`
	StudyID   string `json:"study_id,omitempty"`
}

type sidecarBBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type sidecarFinding struct {
	ID         string      `json:"id"`
	Kind       string      `json:"kind"`
	BIRADS     string      `json:"birads"`
	Confidence float64     `json:"confidence"`
	BBox       sidecarBBox `json:"bbox"`
	Notes      string      `json:"notes"`
}

type sidecarResp struct {
	TaskID    string           `json:"task_id"`
	ModelID   string           `json:"model_id"`
	Findings  []sidecarFinding `json:"findings"`
	ElapsedMs int              `json:"elapsed_ms"`
}

// Predict calls POST /predict (JSON body) and maps results to domain types.
func (c *HTTPClient) Predict(ctx context.Context, imagePath string) (*outbound.FindingCandidates, error) {
	body, _ := json.Marshal(predictReq{ImagePath: imagePath})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/predict", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Local-Token", c.sharedToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ai predict: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ai predict: status %d", resp.StatusCode)
	}

	var raw sidecarResp
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("ai predict decode: %w", err)
	}

	candidates := &outbound.FindingCandidates{ModelID: raw.ModelID}
	for _, f := range raw.Findings {
		candidates.Findings = append(candidates.Findings, &outbound.RichFinding{
			Finding: &entity.Finding{
				ID:          entity.FindingID(f.ID),
				Kind:        entity.FindingKind(f.Kind),
				Description: f.Notes,
				Source:      entity.FindingSourceAI,
			},
			BIRADS:     f.BIRADS,
			Confidence: f.Confidence,
			BBox:       outbound.BBox{X: f.BBox.X, Y: f.BBox.Y, W: f.BBox.W, H: f.BBox.H},
			Notes:      f.Notes,
		})
	}
	return candidates, nil
}

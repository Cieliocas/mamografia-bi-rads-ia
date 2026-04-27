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

// HTTPClient is the outbound.AIClient implementation that talks to the
// FastAPI sidecar over HTTP with shared-token authentication.
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

func (c *HTTPClient) Predict(ctx context.Context, imagePath string) (*outbound.FindingCandidates, error) {
	body, _ := json.Marshal(map[string]string{"image_path": imagePath})
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

	var raw struct {
		Findings []struct {
			BIRADS    string  `json:"birads"`
			X         float64 `json:"x"`
			Y         float64 `json:"y"`
			W         float64 `json:"w"`
			H         float64 `json:"h"`
		} `json:"findings"`
		ModelID string `json:"model_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("ai predict decode: %w", err)
	}

	candidates := &outbound.FindingCandidates{ModelID: raw.ModelID}
	for _, f := range raw.Findings {
		candidates.Findings = append(candidates.Findings, &entity.Finding{
			ID: entity.FindingID(fmt.Sprintf("f-%s", f.BIRADS)),
		})
	}
	return candidates, nil
}

package http

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/ports/outbound"
)

// InferenceHandler handles /api/tasks/predict.
type InferenceHandler struct {
	runInference *usecase.RunInference
}

func NewInferenceHandler(uc *usecase.RunInference) *InferenceHandler {
	return &InferenceHandler{runInference: uc}
}

// RegisterRoutes wires inference endpoints onto the given router group.
func (h *InferenceHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.POST("/tasks/predict", h.predict)
}

// findingJSON is the wire representation of a single finding.
type findingJSON struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	BIRADS     string          `json:"birads"`
	Confidence float64         `json:"confidence"`
	BBox       *outbound.BBox  `json:"bbox,omitempty"`
	Notes      string          `json:"notes,omitempty"`
}

func (h *InferenceHandler) predict(c *gin.Context) {
	var req usecase.RunInferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	out, err := h.runInference.Execute(context.Background(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	findings := make([]findingJSON, 0, len(out.Findings))
	for _, f := range out.Findings {
		fj := findingJSON{
			BIRADS:     f.BIRADS,
			Confidence: f.Confidence,
			Notes:      f.Notes,
		}
		if f.BBox.W > 0 || f.BBox.H > 0 {
			bbox := f.BBox
			fj.BBox = &bbox
		}
		if f.Finding != nil {
			fj.ID = string(f.Finding.ID)
			fj.Kind = string(f.Finding.Kind)
		}
		findings = append(findings, fj)
	}

	c.JSON(http.StatusAccepted, gin.H{
		"task_id":  out.TaskID,
		"model_id": out.ModelID,
		"findings": findings,
		"status":   "completed",
	})
}

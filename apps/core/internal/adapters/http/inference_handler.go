package http

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/application/usecase"
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

	c.JSON(http.StatusAccepted, gin.H{
		"task_id":  out.TaskID,
		"model_id": out.ModelID,
		"findings": out.Findings,
		"status":   "completed",
	})
}

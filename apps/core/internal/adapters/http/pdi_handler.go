package http

import (
	"context"
	"net/http"

	"mammo/apps/core/internal/application/usecase"

	"github.com/gin-gonic/gin"
)

// PDIHandler handles pixel-data-imaging routes.
type PDIHandler struct {
	windowing *usecase.ApplyWindowing
}

func NewPDIHandler(uc *usecase.ApplyWindowing) *PDIHandler {
	return &PDIHandler{windowing: uc}
}

// RegisterRoutes wires PDI endpoints onto the given router group.
func (h *PDIHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.POST("/pdi/windowing", h.applyWindowing)
}

func (h *PDIHandler) applyWindowing(c *gin.Context) {
	var req usecase.WindowingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	out, err := h.windowing.Execute(context.Background(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"pixels": out.Pixels})
}

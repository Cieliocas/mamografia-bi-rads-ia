package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/infrastructure/guardian"
)

// HealthHandler exposes /healthz, /readyz and /startup/status.
type HealthHandler struct {
	supervisor *guardian.Supervisor
}

func NewHealthHandler(g *guardian.Supervisor) *HealthHandler {
	return &HealthHandler{supervisor: g}
}

// RegisterRoutes wires health endpoints directly on the root engine.
func (h *HealthHandler) RegisterRoutes(r *gin.Engine) {
	r.GET("/healthz", h.liveness)
	r.GET("/readyz", h.readiness)
	r.GET("/startup/status", h.startupStatus)
}

func (h *HealthHandler) liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "go-core-up"})
}

func (h *HealthHandler) readiness(c *gin.Context) {
	if err := h.supervisor.HealthCheck(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "ai-down", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (h *HealthHandler) startupStatus(c *gin.Context) {
	if err := h.supervisor.EnsureHealthy(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"state":   "starting",
			"message": "AI engine is still booting",
			"error":   err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": "ready", "message": "AI engine online"})
}

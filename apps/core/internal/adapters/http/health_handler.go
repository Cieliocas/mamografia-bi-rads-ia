package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/infrastructure/guardian"
)

// HealthHandler exposes /healthz, /readyz and /startup/status.
type HealthHandler struct {
	supervisor *guardian.Supervisor
	// dbError is non-empty when the database could not be opened (e.g. corrupted).
	// Exposed in /healthz so the frontend can display a recovery prompt.
	dbError string
}

func NewHealthHandler(g *guardian.Supervisor, dbError string) *HealthHandler {
	return &HealthHandler{supervisor: g, dbError: dbError}
}

// RegisterRoutes wires health endpoints directly on the root engine.
func (h *HealthHandler) RegisterRoutes(r *gin.Engine) {
	r.GET("/healthz", h.liveness)
	r.GET("/readyz", h.readiness)
	r.GET("/startup/status", h.startupStatus)
}

func (h *HealthHandler) liveness(c *gin.Context) {
	body := gin.H{"status": "go-core-up"}
	if h.dbError != "" {
		body["db_status"] = "corrupted"
		body["db_error"] = h.dbError
	} else {
		body["db_status"] = "ok"
	}
	c.JSON(http.StatusOK, body)
}

// readiness reports the state of both the Go core (always up if this handler
// runs) and the optional AI sidecar. The frontend uses ai_engine to decide
// whether to enable IA-related controls. Returns 200 even when AI is down or
// disabled — those are valid runtime states for the no-model release.
func (h *HealthHandler) readiness(c *gin.Context) {
	engine := h.aiEngineState()
	body := gin.H{
		"status":    "ready",
		"go_core":   "up",
		"ai_engine": engine,
		// ai_model is deliberately separate from ai_engine: the sidecar can be
		// perfectly healthy while serving synthetic findings from its mock
		// backend. Collapsing the two into "ready" is how a demonstration ends
		// up presenting fabricated results as model output.
		"ai_model": h.aiModelState(engine),
	}
	if reason := h.supervisor.DisabledReason(); reason != "" {
		body["ai_engine_reason"] = reason
	}
	c.JSON(http.StatusOK, body)
}

func (h *HealthHandler) startupStatus(c *gin.Context) {
	if h.supervisor.IsDisabled() {
		c.JSON(http.StatusOK, gin.H{
			"state":     "ready",
			"message":   "Go core ready; AI engine disabled",
			"ai_engine": "disabled",
			"reason":    h.supervisor.DisabledReason(),
		})
		return
	}
	if err := h.supervisor.EnsureHealthy(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"state":   "starting",
			"message": "AI engine is still booting",
			"error":   err.Error(),
		})
		return
	}
	if !h.supervisor.ModelLoaded() {
		// Still "ready" — the app is usable and this is a valid runtime state —
		// but the caller must be able to tell that no real model is behind it.
		c.JSON(http.StatusOK, gin.H{
			"state":    "ready",
			"message":  "AI engine online (modo simulado — sem modelo carregado)",
			"ai_model": "simulated",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"state":    "ready",
		"message":  "AI engine online",
		"ai_model": "real",
	})
}

// aiModelState returns one of:
//
//	"real"      real weights are loaded; findings come from the models
//	"simulated" the sidecar answers, but from the mock backend — findings are synthetic
//	"none"      the sidecar is down or disabled; there are no findings at all
func (h *HealthHandler) aiModelState(engineState string) string {
	if engineState != "ready" {
		return "none"
	}
	if h.supervisor.ModelLoaded() {
		return "real"
	}
	return "simulated"
}

// aiEngineState returns one of "ready", "down", "disabled".
func (h *HealthHandler) aiEngineState() string {
	if h.supervisor.IsDisabled() {
		return "disabled"
	}
	if err := h.supervisor.HealthCheck(); err != nil {
		return "down"
	}
	return "ready"
}

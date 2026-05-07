package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// NewRouter returns a configured gin engine with CORS middleware and
// all handler routes registered. Handlers are passed as dependencies.
func NewRouter(
	pdi       *PDIHandler,
	study     *StudyHandler,
	inference *InferenceHandler,
	export    *ExportHandler,
	preview   *PreviewHandler,
	backup    *BackupHandler,
	patient   *PatientHandler,
	audio     *AudioHandler,
	health    *HealthHandler,
) *gin.Engine {
	r := gin.Default()

	r.Use(corsMiddleware())

	health.RegisterRoutes(r)

	api := r.Group("/api")
	pdi.RegisterRoutes(api)
	study.RegisterRoutes(api)
	inference.RegisterRoutes(api)
	export.RegisterRoutes(api)
	preview.RegisterRoutes(api)
	backup.RegisterRoutes(api)
	patient.RegisterRoutes(api)
	audio.RegisterRoutes(api)

	return r
}

// NewDegradedRouter starts a minimal server used when the database is
// unavailable (e.g. corrupted). Only /healthz is served so the Angular
// frontend can read db_status and display a recovery prompt.
// All /api/* routes return 503.
func NewDegradedRouter(health *HealthHandler) *gin.Engine {
	r := gin.Default()
	r.Use(corsMiddleware())
	health.RegisterRoutes(r)
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":     "banco de dados indisponível",
			"db_status": "corrupted",
		})
	})
	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Local-Token")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

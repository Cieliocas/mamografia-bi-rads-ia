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
) *gin.Engine {
	r := gin.Default()

	r.Use(corsMiddleware())

	api := r.Group("/api")
	pdi.RegisterRoutes(api)
	study.RegisterRoutes(api)
	inference.RegisterRoutes(api)
	export.RegisterRoutes(api)
	preview.RegisterRoutes(api)
	backup.RegisterRoutes(api)

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

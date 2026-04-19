package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"mammo/apps/core/internal/config"
	"mammo/apps/core/internal/guardian"
	"mammo/apps/core/internal/pdi"
	"mammo/apps/core/internal/queue"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TaskProcessor struct {
	httpClient *http.Client
	aiURL      string
}

func (p *TaskProcessor) Process(ctx context.Context, task queue.Task) error {
	// Placeholder: in production we can pre-process and dispatch to AI here.
	_ = ctx
	log.Printf("processing task id=%s payload=%v", task.ID, task.Payload)
	return nil
}

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0o755); err != nil {
		log.Fatalf("create sqlite dir: %v", err)
	}
	if err := os.MkdirAll(cfg.LocalDataRoot, 0o755); err != nil {
		log.Fatalf("create local data root: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sidecarBin, sidecarArgs, sidecarDir := buildSidecarCommand(cfg)
	supervisor := guardian.New(
		sidecarBin,
		sidecarArgs,
		sidecarDir,
		cfg.AISidecarURL+"/health",
		time.Duration(cfg.GuardianBackoffMs)*time.Millisecond,
	)

	if err := supervisor.Start(ctx); err != nil {
		log.Printf("initial sidecar start failed: %v", err)
	}
	if err := supervisor.EnsureHealthy(ctx); err != nil {
		log.Printf("initial sidecar health check failed: %v", err)
	}
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := supervisor.EnsureHealthy(ctx); err != nil {
					log.Printf("guardian ensure-healthy failed: %v", err)
				}
			}
		}
	}()

	taskQueue := queue.New(4, 128)
	taskQueue.Start(ctx, &TaskProcessor{
		httpClient: &http.Client{Timeout: 60 * time.Second},
		aiURL:      cfg.AISidecarURL,
	})

	router := gin.Default()
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Local-Token")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "go-core-up"})
	})

	router.GET("/readyz", func(c *gin.Context) {
		if err := supervisor.HealthCheck(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "ai-down", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	router.GET("/startup/status", func(c *gin.Context) {
		if err := supervisor.EnsureHealthy(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"state":   "starting",
				"message": "AI engine is still booting",
				"error":   err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"state": "ready", "message": "AI engine online"})
	})

	router.POST("/api/tasks/predict", func(c *gin.Context) {
		var payload map[string]any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		task := queue.Task{ID: uuid.NewString(), Payload: payload}
		taskQueue.Enqueue(task)
		c.JSON(http.StatusAccepted, gin.H{"task_id": task.ID, "status": "queued"})
	})

	router.POST("/api/pdi/windowing", func(c *gin.Context) {
		var req struct {
			Pixels       []int16 `json:"pixels"`
			WindowCenter float64 `json:"window_center"`
			WindowWidth  float64 `json:"window_width"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		result, err := pdi.ApplyWindowing(req.Pixels, req.WindowCenter, req.WindowWidth)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"pixels": result})
	})

	router.Any("/api/ai/*path", func(c *gin.Context) {
		if err := supervisor.EnsureHealthy(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ai-engine unavailable", "details": err.Error()})
			return
		}

		target := cfg.AISidecarURL + c.Param("path")
		req, err := http.NewRequest(c.Request.Method, target, c.Request.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		req.Header = c.Request.Header.Clone()
		req.Header.Set("X-Local-Token", cfg.AISharedToken)

		resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		for k, v := range resp.Header {
			for _, item := range v {
				c.Writer.Header().Add(k, item)
			}
		}
		c.Status(resp.StatusCode)
		_, _ = io.Copy(c.Writer, resp.Body)
	})

	address := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("go-core listening on %s", address)
	if err := router.Run(address); err != nil {
		log.Fatalf("run server: %v", err)
	}
}

func buildSidecarCommand(cfg config.Config) (string, []string, string) {
	if cfg.AISidecarExec != "" {
		return cfg.AISidecarExec, []string{}, cfg.AISidecarWorkDir
	}

	workDir := cfg.AISidecarWorkDir
	if workDir == "" {
		workDir = filepath.Join("..", "..", "ai-engine")
	}
	// For the default FastAPI sidecar, run uvicorn explicitly.
	if cfg.AISidecarScript == "app/main.py" {
		return cfg.AISidecarPython, []string{
			"-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8090",
		}, workDir
	}
	return cfg.AISidecarPython, []string{cfg.AISidecarScript}, workDir
}

package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/adapters/sqlite"
)

// AudioHandler stores per-annotation voice notes on disk and the metadata in
// SQLite. Files live under <localRoot>/audio/<study_id>/<annotation_id>.webm
// (opus codec). Cheap to back up alongside the SQLite snapshot.
type AudioHandler struct {
	repo      *sqlite.AnnotationRepository
	localRoot string
}

func NewAudioHandler(repo *sqlite.AnnotationRepository, localRoot string) *AudioHandler {
	return &AudioHandler{repo: repo, localRoot: localRoot}
}

func (h *AudioHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/annotations/:id/audio", h.upload)
	rg.GET("/annotations/:id/audio", h.serve)
	rg.DELETE("/annotations/:id/audio", h.delete)
}

func (h *AudioHandler) audioDir(studyID string) string {
	return filepath.Join(h.localRoot, "audio", studyID)
}

func (h *AudioHandler) audioPath(studyID, annotID string) string {
	return filepath.Join(h.audioDir(studyID), annotID+".webm")
}

func (h *AudioHandler) upload(c *gin.Context) {
	id := c.Param("id")
	ann, studyID, err := h.repo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "annotation not found"})
		return
	}

	// MediaRecorder sends the blob as raw bytes (not multipart) to keep the
	// frontend simple. Cap at 25 MB to avoid runaway uploads.
	body := http.MaxBytesReader(c.Writer, c.Request.Body, 25*1024*1024)
	defer body.Close()

	if err := os.MkdirAll(h.audioDir(studyID), 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "mkdir: " + err.Error()})
		return
	}
	dst := h.audioPath(studyID, id)
	f, err := os.Create(dst)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create: " + err.Error()})
		return
	}
	defer f.Close()
	if _, err := io.Copy(f, body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "write: " + err.Error()})
		return
	}

	durationMs := 0
	if v := c.Query("duration_ms"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			durationMs = n
		}
	}

	rel, _ := filepath.Rel(h.localRoot, dst)
	ann.AudioPath = rel
	ann.AudioDurationMs = durationMs
	if err := h.repo.Save(context.Background(), studyID, ann); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "persist: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":            "saved",
		"audio_duration_ms": durationMs,
	})
}

func (h *AudioHandler) serve(c *gin.Context) {
	id := c.Param("id")
	ann, studyID, err := h.repo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "annotation not found"})
		return
	}
	if ann.AudioPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no audio for this annotation"})
		return
	}
	path := h.audioPath(studyID, id)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		c.JSON(http.StatusGone, gin.H{"error": "audio file missing on disk"})
		return
	}
	c.Header("Cache-Control", "no-cache")
	c.File(path)
}

func (h *AudioHandler) delete(c *gin.Context) {
	id := c.Param("id")
	ann, studyID, err := h.repo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "annotation not found"})
		return
	}
	if ann.AudioPath != "" {
		_ = os.Remove(h.audioPath(studyID, id))
	}
	ann.AudioPath = ""
	ann.AudioDurationMs = 0
	if err := h.repo.Save(context.Background(), studyID, ann); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("persist: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

package http

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/imaging"
	"mammo/apps/core/internal/ports/outbound"
)

// previewCache is an in-memory cache for rendered PNGs keyed by
// "studyID:frame:wc:ww". It is capped at maxCacheEntries entries; when full
// the entire cache is cleared (simple strategy, good enough for single-user).
const maxCacheEntries = 60

var (
	previewCacheMu   sync.Mutex
	previewCacheMap  = make(map[string][]byte, maxCacheEntries)
	previewCacheSize atomic.Int64
)

func cacheGet(key string) ([]byte, bool) {
	previewCacheMu.Lock()
	v, ok := previewCacheMap[key]
	previewCacheMu.Unlock()
	return v, ok
}

func cacheSet(key string, data []byte) {
	previewCacheMu.Lock()
	if len(previewCacheMap) >= maxCacheEntries {
		previewCacheMap = make(map[string][]byte, maxCacheEntries) // flush
	}
	previewCacheMap[key] = data
	previewCacheMu.Unlock()
	previewCacheSize.Store(int64(len(data)))
}

func previewCacheKey(id string, frame int, wc, ww float64) string {
	return fmt.Sprintf("%s:%d:%.0f:%.0f", id, frame, wc, ww)
}

// PreviewHandler renders a DICOM study's first frame as a PNG with WW/WC
// applied, so the browser canvas can display real .dcm files. The browser
// can't natively decode DICOM, so this is the bridge between the parsed
// pixel data and the viewer.
type PreviewHandler struct {
	repo      outbound.StudyRepository
	annotRepo outbound.AnnotationRepository
	reader    outbound.FilesystemReader
}

func NewPreviewHandler(repo outbound.StudyRepository, annotRepo outbound.AnnotationRepository, reader outbound.FilesystemReader) *PreviewHandler {
	return &PreviewHandler{repo: repo, annotRepo: annotRepo, reader: reader}
}

func (h *PreviewHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/studies/:id/preview", h.preview)
	rg.GET("/studies/:id/preview/annotated", h.previewAnnotated)
}

func isRasterImage(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".png" || ext == ".jpg" || ext == ".jpeg"
}

func (h *PreviewHandler) preview(c *gin.Context) {
	id := c.Param("id")
	study, err := h.repo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}
	if study.FilePath == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "study has no file_path"})
		return
	}

	// PNG / JPG / JPEG: decode → re-encode as PNG so the canvas always gets PNG.
	if isRasterImage(study.FilePath) {
		f, err := os.Open(study.FilePath)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "open file: " + err.Error()})
			return
		}
		defer f.Close()
		img, _, err := image.Decode(f)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "decode image: " + err.Error()})
			return
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "encode png: " + err.Error()})
			return
		}
		c.Data(http.StatusOK, "image/png", buf.Bytes())
		return
	}

	// ?frame=N (0-indexed) selects a specific frame for multi-frame DICOMs.
	// When absent (or 0) the first frame is returned via ReadDICOM so metadata
	// is still available for windowing defaults.
	var pixels *outbound.Pixels16
	var meta *outbound.DICOMMetadata

	frameIdx := 0
	if v, err2 := strconv.Atoi(c.Query("frame")); err2 == nil && v > 0 {
		frameIdx = v
	}

	if frameIdx == 0 {
		pixels, meta, err = h.reader.ReadDICOM(study.FilePath)
	} else {
		pixels, meta, err = h.reader.ReadDICOMFrame(study.FilePath, frameIdx)
	}
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	// Resolve windowing: explicit query params override DICOM header defaults.
	wc, ww := pickWindowing(c, meta)

	// Check cache before re-rendering.
	cacheKey := previewCacheKey(id, frameIdx, wc, ww)
	if cached, ok := cacheGet(cacheKey); ok {
		c.Data(http.StatusOK, "image/png", cached)
		return
	}

	// Use VOI LUT when available and no explicit wc/ww query params are set.
	var img *image.Gray
	if meta != nil && len(meta.VOILUTData) > 0 && c.Query("wc") == "" && c.Query("ww") == "" {
		img = imaging.RenderVOILUT(pixels, meta.VOILUTData, meta.VOILUTFirstEntry)
	} else {
		img = imaging.RenderGrayscale(pixels, wc, ww)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encode png: " + err.Error()})
		return
	}
	cacheSet(cacheKey, buf.Bytes())
	c.Data(http.StatusOK, "image/png", buf.Bytes())
}

// pickWindowing prefers ?ww/wc query params, then DICOM header, then a
// reasonable default (mid-range of 16-bit data).
func pickWindowing(c *gin.Context, meta *outbound.DICOMMetadata) (center, width float64) {
	if v, err := strconv.ParseFloat(c.Query("wc"), 64); err == nil {
		center = v
	} else if meta != nil && meta.WindowCenter != 0 {
		center = meta.WindowCenter
	} else {
		center = 2048
	}
	if v, err := strconv.ParseFloat(c.Query("ww"), 64); err == nil {
		width = v
	} else if meta != nil && meta.WindowWidth != 0 {
		width = meta.WindowWidth
	} else {
		width = 4096
	}
	if width < 1 {
		width = 1
	}
	return center, width
}

// previewAnnotated returns the same PNG as /preview but with the study's
// saved annotations drawn on top: bounding boxes coloured per BI-RADS plus a
// numeric label. Used by the clinical report and by "save marked image".
func (h *PreviewHandler) previewAnnotated(c *gin.Context) {
	id := c.Param("id")
	study, err := h.repo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}
	if study.FilePath == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "study has no file_path"})
		return
	}
	pixels, meta, err := h.reader.ReadDICOM(study.FilePath)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	wc, ww := pickWindowing(c, meta)
	var gray *image.Gray
	if len(meta.VOILUTData) > 0 {
		gray = imaging.RenderVOILUT(pixels, meta.VOILUTData, meta.VOILUTFirstEntry)
	} else {
		gray = imaging.RenderGrayscale(pixels, wc, ww)
	}
	rgba := imaging.ToRGBA(gray)

	anns, err := h.annotRepo.LoadByStudyID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	imaging.DrawAnnotations(rgba, anns)

	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encode png: " + err.Error()})
		return
	}
	c.Data(http.StatusOK, "image/png", buf.Bytes())
}

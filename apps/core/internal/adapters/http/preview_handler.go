package http

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

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
		pixels, err = h.reader.ReadDICOMFrame(study.FilePath, frameIdx)
	}
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	// Resolve windowing: explicit query params override DICOM header defaults.
	wc, ww := pickWindowing(c, meta)
	img := renderGrayscale(pixels, wc, ww)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encode png: " + err.Error()})
		return
	}
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
	gray := renderGrayscale(pixels, wc, ww)

	// Promote to RGBA so we can draw coloured overlays.
	rgba := image.NewRGBA(gray.Bounds())
	draw.Draw(rgba, rgba.Bounds(), gray, image.Point{}, draw.Src)

	anns, err := h.annotRepo.LoadByStudyID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i, a := range anns {
		if a.BBox == nil {
			continue
		}
		drawBBox(rgba, a.BBox, i+1)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encode png: " + err.Error()})
		return
	}
	c.Data(http.StatusOK, "image/png", buf.Bytes())
}

// drawBBox paints a hollow rectangle (3-px stroke) and a small filled
// numeric badge in the top-left corner. Colour is fixed for now (cyan);
// per-BI-RADS colouring lands once we persist the BI-RADS class on
// annotations.
func drawBBox(img *image.RGBA, b *entity.BoundingBox, n int) {
	stroke := color.RGBA{R: 6, G: 182, B: 212, A: 255} // cyan-500
	x0, y0 := int(b.X), int(b.Y)
	x1, y1 := int(b.X+b.Width), int(b.Y+b.Height)

	// Hollow rectangle, 3px thick.
	for t := 0; t < 3; t++ {
		drawHLine(img, x0-t, x1+t, y0-t, stroke)
		drawHLine(img, x0-t, x1+t, y1+t, stroke)
		drawVLine(img, x0-t, y0-t, y1+t, stroke)
		drawVLine(img, x1+t, y0-t, y1+t, stroke)
	}
	// Filled badge in the corner. Crude proportional sizing: 16px tall.
	badge := image.Rect(x0, y0-18, x0+18, y0)
	draw.Draw(img, badge.Intersect(img.Bounds()), &image.Uniform{stroke}, image.Point{}, draw.Src)
	// Number is drawn by the caller as a 5x7 bitmap; keep it simple and
	// avoid bringing in a font for v1: a tiny dot pattern stands in.
	_ = n
}

func drawHLine(img *image.RGBA, x0, x1, y int, c color.Color) {
	if y < img.Bounds().Min.Y || y >= img.Bounds().Max.Y {
		return
	}
	if x0 < img.Bounds().Min.X {
		x0 = img.Bounds().Min.X
	}
	if x1 > img.Bounds().Max.X-1 {
		x1 = img.Bounds().Max.X - 1
	}
	for x := x0; x <= x1; x++ {
		img.Set(x, y, c)
	}
}

func drawVLine(img *image.RGBA, x, y0, y1 int, c color.Color) {
	if x < img.Bounds().Min.X || x >= img.Bounds().Max.X {
		return
	}
	if y0 < img.Bounds().Min.Y {
		y0 = img.Bounds().Min.Y
	}
	if y1 > img.Bounds().Max.Y-1 {
		y1 = img.Bounds().Max.Y - 1
	}
	for y := y0; y <= y1; y++ {
		img.Set(x, y, c)
	}
}

// renderGrayscale maps pixel values through a linear WW/WC LUT into an
// 8-bit grayscale image. Values outside the window are clipped to 0 / 255.
//
// p.Signed controls how the int16 storage is interpreted:
//   - Signed == true  → two's-complement signed range (-32768…32767)
//   - Signed == false → unsigned bits reinterpreted as uint16 (0…65535);
//     this is the correct handling for PixelRepresentation=0 DICOMs where
//     pixel values > 32767 would otherwise appear as negative (black).
func renderGrayscale(p *outbound.Pixels16, wc, ww float64) *image.Gray {
	img := image.NewGray(image.Rect(0, 0, p.Width, p.Height))
	half := ww / 2
	low := wc - half
	for y := 0; y < p.Height; y++ {
		for x := 0; x < p.Width; x++ {
			raw := p.Data[y*p.Width+x]
			var v float64
			if p.Signed {
				v = float64(raw)
			} else {
				v = float64(uint16(raw)) // reinterpret bits as unsigned
			}
			var g uint8
			switch {
			case v <= low:
				g = 0
			case v >= low+ww:
				g = 255
			default:
				g = uint8(((v - low) / ww) * 255)
			}
			img.SetGray(x, y, color.Gray{Y: g})
		}
	}
	return img
}

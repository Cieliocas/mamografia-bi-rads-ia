package http

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/ports/outbound"
)

// PreviewHandler renders a DICOM study's first frame as a PNG with WW/WC
// applied, so the browser canvas can display real .dcm files. The browser
// can't natively decode DICOM, so this is the bridge between the parsed
// pixel data and the viewer.
type PreviewHandler struct {
	repo   outbound.StudyRepository
	reader outbound.FilesystemReader
}

func NewPreviewHandler(repo outbound.StudyRepository, reader outbound.FilesystemReader) *PreviewHandler {
	return &PreviewHandler{repo: repo, reader: reader}
}

func (h *PreviewHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/studies/:id/preview", h.preview)
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

	pixels, meta, err := h.reader.ReadDICOM(study.FilePath)
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

// renderGrayscale maps int16 pixel values through a linear WW/WC LUT into an
// 8-bit grayscale image. Values outside the window are clipped to 0 / 255.
func renderGrayscale(p *outbound.Pixels16, wc, ww float64) *image.Gray {
	img := image.NewGray(image.Rect(0, 0, p.Width, p.Height))
	half := ww / 2
	low := wc - half
	for y := 0; y < p.Height; y++ {
		for x := 0; x < p.Width; x++ {
			v := float64(p.Data[y*p.Width+x])
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

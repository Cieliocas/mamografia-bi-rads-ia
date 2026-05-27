// Package imaging provides shared helpers for rendering DICOM pixel data to
// standard Go image types and for drawing annotation overlays.
// It is used both by the HTTP preview handler and the PDF generator so that
// the exact same pixel-to-grey mapping and overlay style appear in both
// outputs.
package imaging

import (
	"image"
	"image/color"
	"image/draw"
	"strings"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// RenderGrayscale maps raw DICOM pixel values through a linear WW/WC look-up
// table and returns an 8-bit grayscale image.
//
// p.Signed controls how the int16 storage is interpreted:
//   - true  → two's-complement signed range (-32768 … 32767)
//   - false → unsigned bits reinterpreted as uint16 (0 … 65535)
//
// p.Photometric == "MONOCHROME1" inverts the output (0 = white).
func RenderGrayscale(p *outbound.Pixels16, wc, ww float64) *image.Gray {
	if ww < 1 {
		ww = 1
	}
	img  := image.NewGray(image.Rect(0, 0, p.Width, p.Height))
	half := ww / 2
	low  := wc - half
	invert := strings.EqualFold(p.Photometric, "MONOCHROME1")

	for y := 0; y < p.Height; y++ {
		for x := 0; x < p.Width; x++ {
			raw := p.Data[y*p.Width+x]
			var v float64
			if p.Signed {
				v = float64(raw)
			} else {
				v = float64(uint16(raw))
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
			if invert {
				g = 255 - g
			}
			img.SetGray(x, y, color.Gray{Y: g})
		}
	}
	return img
}

// DrawAnnotations paints hollow bounding-box rectangles with a numeric badge
// for each annotation that has a BBox. It promotes the caller to RGBA so
// coloured overlays can be composited.
func DrawAnnotations(img *image.RGBA, anns []*entity.Annotation) {
	for i, a := range anns {
		if a.BBox == nil {
			continue
		}
		drawBBox(img, a.BBox, i+1)
	}
}

// ToRGBA converts a grayscale image to RGBA (needed before drawing colour overlays).
func ToRGBA(gray *image.Gray) *image.RGBA {
	rgba := image.NewRGBA(gray.Bounds())
	draw.Draw(rgba, rgba.Bounds(), gray, image.Point{}, draw.Src)
	return rgba
}

// ── internal helpers ─────────────────────────────────────────────────────────

func drawBBox(img *image.RGBA, b *entity.BoundingBox, n int) {
	stroke := color.RGBA{R: 6, G: 182, B: 212, A: 255} // cyan-500
	x0, y0 := int(b.X), int(b.Y)
	x1, y1 := int(b.X+b.Width), int(b.Y+b.Height)

	// Hollow rectangle, 3 px thick.
	for t := 0; t < 3; t++ {
		drawHLine(img, x0-t, x1+t, y0-t, stroke)
		drawHLine(img, x0-t, x1+t, y1+t, stroke)
		drawVLine(img, x0-t, y0-t, y1+t, stroke)
		drawVLine(img, x1+t, y0-t, y1+t, stroke)
	}
	// Filled badge in the top-left corner (18×18 cyan square — number omitted
	// until a bitmap font is added in a future plan).
	badge := image.Rect(x0, y0-18, x0+18, y0)
	draw.Draw(img, badge.Intersect(img.Bounds()), &image.Uniform{stroke}, image.Point{}, draw.Src)
	_ = n // reserved for future number rendering
}

func drawHLine(img *image.RGBA, x0, x1, y int, c color.Color) {
	b := img.Bounds()
	if y < b.Min.Y || y >= b.Max.Y {
		return
	}
	if x0 < b.Min.X {
		x0 = b.Min.X
	}
	if x1 > b.Max.X-1 {
		x1 = b.Max.X - 1
	}
	for x := x0; x <= x1; x++ {
		img.Set(x, y, c)
	}
}

func drawVLine(img *image.RGBA, x, y0, y1 int, c color.Color) {
	b := img.Bounds()
	if x < b.Min.X || x >= b.Max.X {
		return
	}
	if y0 < b.Min.Y {
		y0 = b.Min.Y
	}
	if y1 > b.Max.Y-1 {
		y1 = b.Max.Y - 1
	}
	for y := y0; y <= y1; y++ {
		img.Set(x, y, c)
	}
}

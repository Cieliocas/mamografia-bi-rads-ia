package filesystem

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/suyashkumar/dicom"
	"github.com/suyashkumar/dicom/pkg/frame"
	"github.com/suyashkumar/dicom/pkg/tag"

	"mammo/apps/core/internal/ports/outbound"
)

// Transfer Syntax UIDs commonly seen in mammography systems.
const (
	tsImplicitLE       = "1.2.840.10008.1.2"
	tsExplicitLE       = "1.2.840.10008.1.2.1"
	tsJPEGBaseline     = "1.2.840.10008.1.2.4.50" // JPEG Baseline (lossy 8-bit)
	tsJPEGExtended     = "1.2.840.10008.1.2.4.51" // JPEG Extended (lossy 12-bit)
	tsJPEGLosslessDef  = "1.2.840.10008.1.2.4.70" // JPEG Lossless (Process 14 SV1) — most common in MG
	tsJPEGLossless     = "1.2.840.10008.1.2.4.57" // JPEG Lossless (Process 14)
	tsJPEGLSLossless   = "1.2.840.10008.1.2.4.80" // JPEG-LS Lossless
	tsJPEGLSNear       = "1.2.840.10008.1.2.4.81" // JPEG-LS Near-lossless
	tsRLELossless      = "1.2.840.10008.1.2.5"    // RLE Lossless
	tsJPEG2000Loss     = "1.2.840.10008.1.2.4.90" // JPEG 2000 Lossless
	tsJPEG2000Lossy    = "1.2.840.10008.1.2.4.91" // JPEG 2000 Lossy
)

// DICOMReader parses real DICOM files using github.com/suyashkumar/dicom.
// Supported pixel formats:
//   - Uncompressed (Implicit/Explicit LE/BE): int16/uint16/uint8
//   - JPEG Baseline / Extended (encapsulated): decoded via image/jpeg
//   - JPEG Lossless (Process 14, SV1): decoded via dcmdjpeg shell-out if available
//   - JPEG-LS / JPEG 2000: dcmdjpeg / gdcmconv shell-out, with informative error fallback
type DICOMReader struct{}

func NewDICOMReader() *DICOMReader { return &DICOMReader{} }

func (r *DICOMReader) ReadDICOM(path string) (*outbound.Pixels16, *outbound.DICOMMetadata, error) {
	ds, err := dicom.ParseFile(path, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("dicom_reader: parse %q: %w", path, err)
	}

	meta := &outbound.DICOMMetadata{
		PatientID:   firstString(ds, tag.PatientID, "UNKNOWN"),
		StudyDate:   firstString(ds, tag.StudyDate, ""),
		Modality:    firstString(ds, tag.Modality, "MG"),
		Description: dicomDescription(ds, path),
	}
	meta.WindowCenter, _ = firstFloat(ds, tag.WindowCenter)
	meta.WindowWidth, _ = firstFloat(ds, tag.WindowWidth)
	meta.BitsStored, _ = firstInt(ds, tag.BitsStored)

	ts := strings.TrimSpace(firstString(ds, tag.TransferSyntaxUID, ""))

	pixels, err := readFirstFrameInt16(ds, path, ts)
	if err != nil {
		return nil, nil, fmt.Errorf("dicom_reader: pixels in %q (TS=%s): %w", path, ts, err)
	}
	return pixels, meta, nil
}

func readFirstFrameInt16(ds dicom.Dataset, path, ts string) (*outbound.Pixels16, error) {
	el, err := ds.FindElementByTag(tag.PixelData)
	if err != nil {
		return nil, fmt.Errorf("missing PixelData: %w", err)
	}
	info, ok := el.Value.GetValue().(dicom.PixelDataInfo)
	if !ok {
		return nil, fmt.Errorf("PixelData has unexpected value type")
	}
	if len(info.Frames) == 0 {
		return nil, fmt.Errorf("PixelData has no frames")
	}
	f := info.Frames[0]

	// ── Native (uncompressed) path ────────────────────────────────────────────
	if !f.Encapsulated && f.NativeData != nil {
		return nativeToPixels16(f.NativeData)
	}

	// ── Encapsulated (compressed) path ───────────────────────────────────────
	ef, efErr := f.GetEncapsulatedFrame()
	if efErr != nil || ef == nil || len(ef.Data) == 0 {
		return nil, fmt.Errorf("encapsulated frame has no data (TS=%s)", ts)
	}

	switch ts {
	case tsJPEGBaseline, tsJPEGExtended, "":
		// Standard JPEG: the library's GetImage() uses image/jpeg directly.
		return encapsulatedJPEGToPixels16(ef)

	case tsJPEGLosslessDef, tsJPEGLossless:
		// JPEG Lossless (Process 14): most common in digital mammography.
		// Try dcmdjpeg (DCMTK) as the best available pure decompressor.
		if pix, err := decompressViaDCMTK(path); err == nil {
			return pix, nil
		}
		// Fallback: see if the library can still decode it as standard JPEG.
		if pix, err := encapsulatedJPEGToPixels16(ef); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf(
			"JPEG Lossless (TS %s) not supported natively; install DCMTK ('brew install dcmtk') to enable decoding",
			ts,
		)

	case tsJPEGLSLossless, tsJPEGLSNear:
		if pix, err := decompressViaDCMTK(path); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf(
			"JPEG-LS (TS %s) not supported natively; install DCMTK ('brew install dcmtk') to enable decoding",
			ts,
		)

	case tsRLELossless:
		return nil, fmt.Errorf("RLE Lossless (TS %s) is not yet supported", ts)

	case tsJPEG2000Loss, tsJPEG2000Lossy:
		if pix, err := decompressViaGDCM(path); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf(
			"JPEG 2000 (TS %s) not supported natively; install GDCM ('brew install gdcm') to enable decoding",
			ts,
		)

	default:
		// Unknown or future TS — try standard JPEG decode as a last resort.
		if pix, err := encapsulatedJPEGToPixels16(ef); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf("unsupported transfer syntax %q", ts)
	}
}

// nativeToPixels16 converts an uncompressed NativeFrame to Pixels16.
func nativeToPixels16(nd frame.INativeFrame) (*outbound.Pixels16, error) {
	rows := nd.Rows()
	cols := nd.Cols()
	if rows <= 0 || cols <= 0 {
		return nil, fmt.Errorf("invalid frame dimensions %dx%d", cols, rows)
	}
	raw := nd.RawDataSlice()
	data := make([]int16, 0, rows*cols)
	switch s := raw.(type) {
	case []uint16:
		for _, v := range s { data = append(data, int16(v)) }
	case []int16:
		data = append(data, s...)
	case []uint8:
		for _, v := range s { data = append(data, int16(v)) }
	case []int:
		for _, v := range s { data = append(data, int16(v)) }
	default:
		return nil, fmt.Errorf("unsupported pixel slice type %T", raw)
	}
	return &outbound.Pixels16{Data: data, Width: cols, Height: rows}, nil
}

// encapsulatedJPEGToPixels16 decodes a standard JPEG encapsulated frame.
func encapsulatedJPEGToPixels16(ef *frame.EncapsulatedFrame) (*outbound.Pixels16, error) {
	img, err := jpeg.Decode(bytes.NewReader(ef.Data))
	if err != nil {
		return nil, fmt.Errorf("jpeg decode: %w", err)
	}
	return imageToPixels16(img)
}

// imageToPixels16 converts any Go image.Image to a 16-bit grayscale pixel buffer.
func imageToPixels16(img image.Image) (*outbound.Pixels16, error) {
	b := img.Bounds()
	w, h := b.Max.X-b.Min.X, b.Max.Y-b.Min.Y
	data := make([]int16, 0, w*h)
	gray := color.Gray16Model
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := gray.Convert(img.At(x, y)).(color.Gray16)
			data = append(data, int16(c.Y))
		}
	}
	return &outbound.Pixels16{Data: data, Width: w, Height: h}, nil
}

// decompressViaDCMTK uses `dcmdjpeg` (part of DCMTK) to convert a compressed
// DICOM to an uncompressed temp file, then parses that.
// Returns an error if dcmdjpeg is not found on PATH.
func decompressViaDCMTK(srcPath string) (*outbound.Pixels16, error) {
	dcmdjpeg, err := exec.LookPath("dcmdjpeg")
	if err != nil {
		return nil, fmt.Errorf("dcmdjpeg not found on PATH")
	}
	tmp, err := os.CreateTemp("", "aidentify-*.dcm")
	if err != nil {
		return nil, err
	}
	tmp.Close()
	defer os.Remove(tmp.Name())

	cmd := exec.Command(dcmdjpeg, srcPath, tmp.Name())
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("dcmdjpeg: %s: %w", strings.TrimSpace(string(out)), err)
	}

	dr := &DICOMReader{}
	pix, _, err := dr.ReadDICOM(tmp.Name())
	return pix, err
}

// decompressViaGDCM uses `gdcmconv` (part of GDCM) to convert a JPEG 2000
// compressed DICOM to uncompressed form, then parses that.
func decompressViaGDCM(srcPath string) (*outbound.Pixels16, error) {
	gdcmconv, err := exec.LookPath("gdcmconv")
	if err != nil {
		return nil, fmt.Errorf("gdcmconv not found on PATH")
	}
	tmp, err := os.CreateTemp("", "aidentify-*.dcm")
	if err != nil {
		return nil, err
	}
	tmp.Close()
	defer os.Remove(tmp.Name())

	cmd := exec.Command(gdcmconv, "-w", srcPath, tmp.Name())
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("gdcmconv: %s: %w", strings.TrimSpace(string(out)), err)
	}

	dr := &DICOMReader{}
	pix, _, err := dr.ReadDICOM(tmp.Name())
	return pix, err
}

// --- dataset helpers ---

func dicomDescription(ds dicom.Dataset, path string) string {
	if s := firstString(ds, tag.SeriesDescription, ""); s != "" {
		return s
	}
	if s := firstString(ds, tag.StudyDescription, ""); s != "" {
		return s
	}
	return filepath.Base(path)
}

func firstString(ds dicom.Dataset, t tag.Tag, fallback string) string {
	el, err := ds.FindElementByTag(t)
	if err != nil {
		return fallback
	}
	if ss, ok := el.Value.GetValue().([]string); ok && len(ss) > 0 {
		return strings.TrimSpace(ss[0])
	}
	return fallback
}

func firstFloat(ds dicom.Dataset, t tag.Tag) (float64, bool) {
	el, err := ds.FindElementByTag(t)
	if err != nil {
		return 0, false
	}
	switch v := el.Value.GetValue().(type) {
	case []float64:
		if len(v) > 0 { return v[0], true }
	case []string:
		if len(v) > 0 {
			if f, err := strconv.ParseFloat(strings.TrimSpace(v[0]), 64); err == nil {
				return f, true
			}
		}
	case []int:
		if len(v) > 0 { return float64(v[0]), true }
	}
	return 0, false
}

func firstInt(ds dicom.Dataset, t tag.Tag) (int, bool) {
	el, err := ds.FindElementByTag(t)
	if err != nil {
		return 0, false
	}
	if ints, ok := el.Value.GetValue().([]int); ok && len(ints) > 0 {
		return ints[0], true
	}
	return 0, false
}

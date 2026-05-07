package filesystem

import (
	"bytes"
	"encoding/binary"
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

	// FrameCount: prefer explicit (0028,0008); fall back to counting parsed frames.
	if n, ok := firstInt(ds, tag.NumberOfFrames); ok && n > 0 {
		meta.FrameCount = n
	} else if n := countFrames(ds); n > 0 {
		meta.FrameCount = n
	} else {
		meta.FrameCount = 1
	}

	ts := strings.TrimSpace(firstString(ds, tag.TransferSyntaxUID, ""))

	bitsAlloc, _ := firstInt(ds, tag.BitsAllocated)
	samplesPerPx, _ := firstInt(ds, tag.SamplesPerPixel)
	rows, _ := firstInt(ds, tag.Rows)
	cols, _ := firstInt(ds, tag.Columns)
	// PixelRepresentation (0028,0103): 0 = unsigned, 1 = signed.
	pixelRepr, _ := firstInt(ds, tag.PixelRepresentation)

	pixels, err := readFrameInt16(ds, path, ts, 0, bitsAlloc, samplesPerPx, rows, cols)
	if err != nil {
		return nil, nil, fmt.Errorf("dicom_reader: pixels in %q (TS=%s): %w", path, ts, err)
	}
	pixels.Signed = pixelRepr == 1
	return pixels, meta, nil
}

// ReadDICOMFrame reads a specific frame (0-indexed) from a DICOM file.
func (r *DICOMReader) ReadDICOMFrame(path string, frameIdx int) (*outbound.Pixels16, error) {
	ds, err := dicom.ParseFile(path, nil)
	if err != nil {
		return nil, fmt.Errorf("dicom_reader: parse %q: %w", path, err)
	}
	ts := strings.TrimSpace(firstString(ds, tag.TransferSyntaxUID, ""))
	bitsAlloc, _ := firstInt(ds, tag.BitsAllocated)
	samplesPerPx, _ := firstInt(ds, tag.SamplesPerPixel)
	rows, _ := firstInt(ds, tag.Rows)
	cols, _ := firstInt(ds, tag.Columns)
	pixelRepr, _ := firstInt(ds, tag.PixelRepresentation)
	pixels, err := readFrameInt16(ds, path, ts, frameIdx, bitsAlloc, samplesPerPx, rows, cols)
	if err != nil {
		return nil, err
	}
	pixels.Signed = pixelRepr == 1
	return pixels, nil
}

func countFrames(ds dicom.Dataset) int {
	el, err := ds.FindElementByTag(tag.PixelData)
	if err != nil {
		return 0
	}
	info, ok := el.Value.GetValue().(dicom.PixelDataInfo)
	if !ok {
		return 0
	}
	return len(info.Frames)
}

func readFrameInt16(ds dicom.Dataset, path, ts string, frameIdx, bitsAlloc, samplesPerPx, rows, cols int) (*outbound.Pixels16, error) {
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
	if frameIdx < 0 || frameIdx >= len(info.Frames) {
		return nil, fmt.Errorf("frame index %d out of range [0, %d)", frameIdx, len(info.Frames))
	}
	f := info.Frames[frameIdx]

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
		return encapsulatedJPEGToPixels16(ef)

	case tsJPEGLosslessDef, tsJPEGLossless:
		// JPEG Lossless (Process 14): most common in digital mammography.
		if frameIdx == 0 {
			if pix, err := decompressViaDCMTK(path); err == nil {
				return pix, nil
			}
		}
		if pix, err := encapsulatedJPEGToPixels16(ef); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf(
			"JPEG Lossless (TS %s) requires DCMTK ('brew install dcmtk')", ts)

	case tsJPEGLSLossless, tsJPEGLSNear:
		if frameIdx == 0 {
			if pix, err := decompressViaDCMTK(path); err == nil {
				return pix, nil
			}
		}
		return nil, fmt.Errorf(
			"JPEG-LS (TS %s) requires DCMTK ('brew install dcmtk')", ts)

	case tsRLELossless:
		if rows > 0 && cols > 0 {
			if pix, err := decodeRLEFrame(ef.Data, rows, cols, bitsAlloc, samplesPerPx); err == nil {
				return pix, nil
			}
		}
		return nil, fmt.Errorf("RLE Lossless decode failed (rows=%d cols=%d bits=%d)", rows, cols, bitsAlloc)

	case tsJPEG2000Loss, tsJPEG2000Lossy:
		if frameIdx == 0 {
			if pix, err := decompressViaGDCM(path); err == nil {
				return pix, nil
			}
		}
		return nil, fmt.Errorf(
			"JPEG 2000 (TS %s) requires GDCM ('brew install gdcm')", ts)

	default:
		if pix, err := encapsulatedJPEGToPixels16(ef); err == nil {
			return pix, nil
		}
		return nil, fmt.Errorf("unsupported transfer syntax %q", ts)
	}
}

// decodeRLEFrame decodes a DICOM RLE Lossless fragment (DICOM PS 3.5, Annex G).
// Each fragment begins with a 64-byte header: number of segments (uint32 LE)
// followed by up to 15 segment offsets (uint32 LE each).
// For 16-bit grayscale: segment 0 = high bytes, segment 1 = low bytes.
func decodeRLEFrame(data []byte, rows, cols, bitsAlloc, samplesPerPx int) (*outbound.Pixels16, error) {
	if len(data) < 64 {
		return nil, fmt.Errorf("RLE fragment too short (%d bytes)", len(data))
	}

	nSegments := int(binary.LittleEndian.Uint32(data[0:4]))
	if nSegments == 0 || nSegments > 15 {
		return nil, fmt.Errorf("RLE: invalid segment count %d", nSegments)
	}

	offsets := make([]int, nSegments)
	for i := 0; i < nSegments; i++ {
		offsets[i] = int(binary.LittleEndian.Uint32(data[4+i*4:]))
	}

	decodeSegment := func(segIdx int) ([]byte, error) {
		start := offsets[segIdx]
		end := len(data)
		if segIdx+1 < nSegments {
			end = offsets[segIdx+1]
		}
		if start < 0 || start > len(data) || end < start {
			return nil, fmt.Errorf("RLE segment %d out of bounds", segIdx)
		}
		return rlePackBitsDecode(data[start:end], rows*cols)
	}

	nPixels := rows * cols
	out := make([]int16, nPixels)

	switch {
	case bitsAlloc == 16 && nSegments >= 2:
		hi, err := decodeSegment(0)
		if err != nil {
			return nil, err
		}
		lo, err := decodeSegment(1)
		if err != nil {
			return nil, err
		}
		for i := 0; i < nPixels && i < len(hi) && i < len(lo); i++ {
			out[i] = int16(uint16(hi[i])<<8 | uint16(lo[i]))
		}
	case bitsAlloc == 8 || nSegments == 1:
		seg, err := decodeSegment(0)
		if err != nil {
			return nil, err
		}
		for i := 0; i < nPixels && i < len(seg); i++ {
			out[i] = int16(seg[i]) << 8 // scale 8→16-bit
		}
	default:
		return nil, fmt.Errorf("RLE: unsupported config bits=%d segments=%d", bitsAlloc, nSegments)
	}

	return &outbound.Pixels16{Data: out, Width: cols, Height: rows}, nil
}

// rlePackBitsDecode decodes a single PackBits-encoded byte slice into
// at most maxBytes output bytes (DICOM RLE uses Macintosh PackBits).
func rlePackBitsDecode(src []byte, maxBytes int) ([]byte, error) {
	dst := make([]byte, 0, maxBytes)
	i := 0
	for i < len(src) && len(dst) < maxBytes {
		n := int(int8(src[i]))
		i++
		switch {
		case n >= 0 && n <= 127: // literal run: copy next n+1 bytes
			count := n + 1
			if i+count > len(src) {
				count = len(src) - i
			}
			dst = append(dst, src[i:i+count]...)
			i += count
		case n == -128: // no-op
		default: // n from -127 to -1: replicate next byte 1-n times
			if i >= len(src) {
				break
			}
			b := src[i]
			i++
			rep := 1 - n
			for j := 0; j < rep && len(dst) < maxBytes; j++ {
				dst = append(dst, b)
			}
		}
	}
	return dst, nil
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

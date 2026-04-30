package filesystem

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/suyashkumar/dicom"
	"github.com/suyashkumar/dicom/pkg/tag"

	"mammo/apps/core/internal/ports/outbound"
)

// DICOMReader parses real DICOM files using github.com/suyashkumar/dicom.
// It extracts the first native pixel frame as int16 and the most useful header
// fields for downstream display (WW/WC) and identification (PatientID, etc.).
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

	pixels, err := readFirstFrameInt16(ds)
	if err != nil {
		return nil, nil, fmt.Errorf("dicom_reader: pixels in %q: %w", path, err)
	}
	return pixels, meta, nil
}

func dicomDescription(ds dicom.Dataset, path string) string {
	if s := firstString(ds, tag.SeriesDescription, ""); s != "" {
		return s
	}
	if s := firstString(ds, tag.StudyDescription, ""); s != "" {
		return s
	}
	return filepath.Base(path)
}

func readFirstFrameInt16(ds dicom.Dataset) (*outbound.Pixels16, error) {
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
	if f.Encapsulated || f.NativeData == nil {
		return nil, fmt.Errorf("encapsulated/compressed pixel data is not supported yet")
	}
	rows := f.NativeData.Rows()
	cols := f.NativeData.Cols()
	if rows <= 0 || cols <= 0 {
		return nil, fmt.Errorf("invalid frame dimensions %dx%d", cols, rows)
	}

	raw := f.NativeData.RawDataSlice()
	data := make([]int16, 0, rows*cols)
	switch s := raw.(type) {
	case []uint16:
		for _, v := range s {
			data = append(data, int16(v))
		}
	case []int16:
		data = append(data, s...)
	case []uint8:
		for _, v := range s {
			data = append(data, int16(v))
		}
	case []int:
		for _, v := range s {
			data = append(data, int16(v))
		}
	default:
		return nil, fmt.Errorf("unsupported pixel slice type %T", raw)
	}

	return &outbound.Pixels16{
		Data:   data,
		Width:  cols,
		Height: rows,
	}, nil
}

// --- dataset helpers ---

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
		if len(v) > 0 {
			return v[0], true
		}
	case []string:
		if len(v) > 0 {
			if f, err := strconv.ParseFloat(strings.TrimSpace(v[0]), 64); err == nil {
				return f, true
			}
		}
	case []int:
		if len(v) > 0 {
			return float64(v[0]), true
		}
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

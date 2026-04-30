package filesystem

import (
	"fmt"
	"os"

	"mammo/apps/core/internal/ports/outbound"
)

// DICOMReader is a stub implementation of outbound.FilesystemReader.
// It reads the file to confirm it exists and returns placeholder metadata.
// The real 16-bit pixel parser is deferred to Plan 04 (DICOM Pipeline).
type DICOMReader struct{}

func NewDICOMReader() *DICOMReader { return &DICOMReader{} }

func (r *DICOMReader) ReadDICOM(path string) (*outbound.Pixels16, *outbound.DICOMMetadata, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, nil, fmt.Errorf("dicom_reader: cannot stat %q: %w", path, err)
	}

	// Placeholder: return a 1×1 zero pixel and filename-derived metadata.
	// Plan 04 will replace this with a proper dcmtk/dicom-go parser.
	pixels := &outbound.Pixels16{
		Data:   []int16{0},
		Width:  1,
		Height: 1,
	}
	meta := &outbound.DICOMMetadata{
		PatientID:   "UNKNOWN",
		StudyDate:   "",
		Modality:    "MG",
		Description: info.Name(),
	}
	return pixels, meta, nil
}

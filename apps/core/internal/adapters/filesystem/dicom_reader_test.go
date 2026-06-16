package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

// findSampleDICOM locates a real .dcm fixture from the suyashkumar/dicom
// testdata in the local module cache. Skips the test if unavailable.
func findSampleDICOM(t *testing.T) string {
	t.Helper()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no home dir: %v", err)
	}
	candidates, _ := filepath.Glob(filepath.Join(home, "go/pkg/mod/github.com/suyashkumar/dicom@*/testdata/*.dcm"))
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.Size() > 0 {
			return c
		}
	}
	t.Skip("no sample .dcm found in module cache")
	return ""
}

func TestDICOMReader_ReadDICOM_RealFile(t *testing.T) {
	path := findSampleDICOM(t)
	r := NewDICOMReader()
	pixels, meta, err := r.ReadDICOM(path)
	if err != nil {
		t.Fatalf("ReadDICOM(%s): %v", path, err)
	}
	if pixels.Width <= 0 || pixels.Height <= 0 {
		t.Errorf("invalid dims %dx%d", pixels.Width, pixels.Height)
	}
	if got, want := len(pixels.Data), pixels.Width*pixels.Height; got != want {
		t.Errorf("data length = %d, want %d", got, want)
	}
	if meta.PatientID == "" {
		t.Error("PatientID is empty (expected at least fallback)")
	}
}

// TestDICOMReader_ReadDICOMFrame_ReturnsMetadata guards the multi-frame fix:
// ReadDICOMFrame must return the header metadata (not nil) so every frame can
// be rendered with the correct VOI LUT / windowing, not just frame 0.
func TestDICOMReader_ReadDICOMFrame_ReturnsMetadata(t *testing.T) {
	path := findSampleDICOM(t)
	r := NewDICOMReader()
	pixels, meta, err := r.ReadDICOMFrame(path, 0)
	if err != nil {
		t.Fatalf("ReadDICOMFrame(%s, 0): %v", path, err)
	}
	if meta == nil {
		t.Fatal("ReadDICOMFrame returned nil metadata")
	}
	if pixels.Width <= 0 || pixels.Height <= 0 {
		t.Errorf("invalid dims %dx%d", pixels.Width, pixels.Height)
	}
	// Dimensions reported in metadata must match the decoded pixel buffer.
	if meta.Columns != pixels.Width || meta.Rows != pixels.Height {
		t.Errorf("meta dims %dx%d != pixel dims %dx%d",
			meta.Columns, meta.Rows, pixels.Width, pixels.Height)
	}
}

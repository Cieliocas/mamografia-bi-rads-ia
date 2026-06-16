package filesystem

import (
	"path/filepath"
	"runtime"
	"testing"
)

// testdataDir resolves the package-local testdata directory regardless of the
// working directory the test runs from.
func testdataDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve caller path")
	}
	return filepath.Join(filepath.Dir(file), "testdata")
}

// TestDecodeJPEGLS_AgainstReference decodes a real JPEG-LS DICOM with the pure-Go
// decoder and asserts the pixels are bit-identical to the uncompressed reference
// (produced from the same source by DCMTK's CharLS-based dcmdjpls). JPEG-LS
// lossless must reconstruct the original exactly.
func TestDecodeJPEGLS_AgainstReference(t *testing.T) {
	dir := testdataDir(t)
	r := NewDICOMReader()

	// Pure-Go JPEG-LS decode.
	got, _, err := r.ReadDICOM(filepath.Join(dir, "jpegls_lossless.dcm"))
	if err != nil {
		t.Fatalf("ReadDICOM(jpegls_lossless.dcm): %v", err)
	}

	// Oracle: the uncompressed version decoded via the native path.
	want, _, err := r.ReadDICOM(filepath.Join(dir, "jpegls_reference.dcm"))
	if err != nil {
		t.Fatalf("ReadDICOM(jpegls_reference.dcm): %v", err)
	}

	if got.Width != want.Width || got.Height != want.Height {
		t.Fatalf("dims %dx%d != reference %dx%d", got.Width, got.Height, want.Width, want.Height)
	}
	if len(got.Data) != len(want.Data) {
		t.Fatalf("pixel count %d != reference %d", len(got.Data), len(want.Data))
	}

	mismatches := 0
	firstAt := -1
	for i := range got.Data {
		if got.Data[i] != want.Data[i] {
			if firstAt < 0 {
				firstAt = i
			}
			mismatches++
		}
	}
	if mismatches > 0 {
		t.Fatalf("%d/%d pixels differ; first at index %d (got %d, want %d)",
			mismatches, len(got.Data), firstAt,
			got.Data[firstAt], want.Data[firstAt])
	}
}

func TestDecodeJPEGLS_BadInput(t *testing.T) {
	if _, _, _, err := decodeJPEGLS([]byte{0x00, 0x01}); err == nil {
		t.Error("expected error for missing SOI")
	}
	if _, _, _, err := decodeJPEGLS([]byte{0xFF, 0xD8}); err == nil {
		t.Error("expected error for truncated stream")
	}
}

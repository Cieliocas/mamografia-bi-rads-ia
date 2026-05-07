package outbound

// Pixels16 holds raw 16-bit pixel data from a single DICOM frame.
type Pixels16 struct {
	Data   []int16
	Width  int
	Height int
}

// DICOMMetadata captures the essential DICOM header fields.
type DICOMMetadata struct {
	PatientID    string
	StudyDate    string
	Modality     string
	Description  string
	WindowCenter float64 // 0 if absent
	WindowWidth  float64 // 0 if absent
	BitsStored   int     // 0 if absent
	FrameCount   int     // total number of frames; 1 for single-frame DICOMs
}

// FilesystemReader provides raw access to DICOM files on disk.
type FilesystemReader interface {
	// ReadDICOM reads the first frame of the DICOM at path.
	ReadDICOM(path string) (*Pixels16, *DICOMMetadata, error)
	// ReadDICOMFrame reads a specific frame (0-indexed) from the DICOM.
	// Returns an error if frameIdx is out of bounds.
	ReadDICOMFrame(path string, frameIdx int) (*Pixels16, error)
}

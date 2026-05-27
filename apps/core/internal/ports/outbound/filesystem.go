package outbound

// Pixels16 holds raw pixel data from a single DICOM frame, normalised to
// int16 storage. Callers that need the true numeric range must consult Signed:
//   - Signed == true  → values are two's-complement int16 (-32768 … 32767)
//   - Signed == false → values are unsigned uint16 bits stored in int16;
//     recover the original value with uint16(v).
type Pixels16 struct {
	Data   []int16
	Width  int
	Height int
	// Signed reflects DICOM tag PixelRepresentation (0028,0103):
	// 0 = unsigned (default), 1 = signed two's-complement.
	Signed bool
	// Photometric is the DICOM PhotometricInterpretation (0028,0004).
	// "MONOCHROME1" means pixel value 0 = white (inverted scale).
	// Empty string → treat as MONOCHROME2 (pixel 0 = black, default).
	Photometric string
}

// DICOMMetadata captures the essential DICOM header fields.
type DICOMMetadata struct {
	// ── Patient ──────────────────────────────────────────────────────────────
	PatientName      string // (0010,0010)
	PatientID        string // (0010,0020)
	PatientBirthDate string // (0010,0030) YYYYMMDD
	PatientSex       string // (0010,0040) M/F/O

	// ── Study ─────────────────────────────────────────────────────────────────
	StudyDate        string // (0008,0020) YYYYMMDD
	StudyDescription string // (0008,1030)
	AccessionNumber  string // (0008,0050)
	StudyInstanceUID string // (0020,000D)

	// ── Series ────────────────────────────────────────────────────────────────
	Modality        string // (0008,0060)
	Description     string // SeriesDescription or StudyDescription fallback
	SeriesNumber    string // (0020,0011)
	Laterality      string // (0020,0060) L/R
	ViewPosition    string // (0018,5101) CC/MLO/…
	BodyPartExamined string // (0018,0015)

	// ── Equipment ─────────────────────────────────────────────────────────────
	Manufacturer      string // (0008,0070)
	ManufacturerModel string // (0008,1090)
	InstitutionName   string // (0008,0080)
	StationName       string // (0008,1010)

	// ── Acquisition ───────────────────────────────────────────────────────────
	KVP              float64 // (0018,0060) kilo-volt peak
	ExposureTime     int     // (0018,1150) ms
	TubeCurrent      int     // (0018,1151) mA
	Exposure         int     // (0018,1152) mAs
	CompressionForce float64 // (0018,11A2) N — mammography-specific
	ImagerPixelSpacingRow float64 // (0018,1164) row spacing in mm

	// ── Image ─────────────────────────────────────────────────────────────────
	WindowCenter float64 // (0028,1050) 0 if absent
	WindowWidth  float64 // (0028,1051) 0 if absent
	BitsStored   int     // (0028,0101)
	BitsAllocated int    // (0028,0100)
	Rows         int     // (0028,0010)
	Columns      int     // (0028,0011)
	PixelSpacing float64 // (0028,0030) mm per pixel (row spacing)
	Photometric  string  // (0028,0004)
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

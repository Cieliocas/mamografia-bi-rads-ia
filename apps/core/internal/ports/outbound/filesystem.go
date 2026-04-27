package outbound

// Pixels16 holds raw 16-bit pixel data from a DICOM image.
type Pixels16 struct {
	Data   []int16
	Width  int
	Height int
}

// DICOMMetadata captures the essential DICOM header fields.
type DICOMMetadata struct {
	PatientID   string
	StudyDate   string
	Modality    string
	Description string
}

// FilesystemReader provides raw access to DICOM files on disk.
type FilesystemReader interface {
	ReadDICOM(path string) (*Pixels16, *DICOMMetadata, error)
}

package entity

import (
	"time"

	"mammo/apps/core/internal/domain/valueobject"
)

type StudyID string
type SeriesID string

// Study aggregates a patient exam session, possibly containing multiple views.
type Study struct {
	ID         StudyID
	PatientID  string
	StudyDate  time.Time
	FilePath   string // absolute path to source DICOM, used for preview rendering
	Density    *valueobject.Density
	Series     []Series
	CreatedAt  time.Time
	ModifiedAt time.Time
}

// Series is a single image acquisition (e.g., Left-CC view).
type Series struct {
	ID            SeriesID
	StudyID       StudyID
	Laterality    valueobject.Laterality
	Projection    valueobject.Projection
	ImagePath     string
	PixelsWidth   int
	PixelsHeight  int
	BitsStored    int // typically 12 or 16 for mammography DICOM
	CompressionKg *float64
	PatientAge    *int
}

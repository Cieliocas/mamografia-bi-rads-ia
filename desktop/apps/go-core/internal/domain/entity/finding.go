package entity

import (
	"time"

	"mammo/desktop/go-core/internal/domain/valueobject"
)

type FindingID string

// FindingKind classifies the type of finding a radiologist is flagging.
type FindingKind string

const (
	FindingMass              FindingKind = "mass"
	FindingMicrocalcification FindingKind = "microcalcification"
	FindingAsymmetry         FindingKind = "asymmetry"
	FindingDistortion        FindingKind = "architectural_distortion"
	FindingOther             FindingKind = "other"
)

// Finding represents a radiological finding within a series.
// Can be produced by an annotator (manual) or by AI (automatic).
type Finding struct {
	ID          FindingID
	SeriesID    SeriesID
	Kind        FindingKind
	Description string
	BIRADS      *valueobject.BIRADSCategory
	Annotations []Annotation
	Source      FindingSource
	CreatedBy   UserID // empty when Source == FindingSourceAI
	CreatedAt   time.Time
}

type FindingSource string

const (
	FindingSourceManual FindingSource = "manual"
	FindingSourceAI     FindingSource = "ai"
)

package entity

type AnnotationID string

// AnnotationKind tags which geometry payload is populated on an Annotation.
type AnnotationKind string

const (
	AnnotationBoundingBox AnnotationKind = "bbox"
	AnnotationPolygon     AnnotationKind = "polygon"
	AnnotationPoint       AnnotationKind = "point"
)

// Point is expressed in image pixel coordinates (origin top-left).
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// BoundingBox is axis-aligned; X/Y is the top-left corner.
type BoundingBox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"w"`
	Height float64 `json:"h"`
}

type Polygon struct {
	Points []Point `json:"points"`
}

// Annotation is a tagged union; exactly one of BBox/Polygon/Point is set
// according to Kind.
type Annotation struct {
	ID      AnnotationID   `json:"id"`
	Kind    AnnotationKind `json:"kind"`
	BBox    *BoundingBox   `json:"bbox,omitempty"`
	Polygon *Polygon       `json:"polygon,omitempty"`
	Point   *Point         `json:"point,omitempty"`

	// Free-text label and clinical notes written by the radiologist.
	Label string `json:"label,omitempty"`
	Notes string `json:"notes,omitempty"`

	// Voice note metadata. AudioPath is relative to MAMMO_LOCAL_ROOT/audio/.
	AudioPath       string `json:"audio_path,omitempty"`
	AudioDurationMs int    `json:"audio_duration_ms,omitempty"`
	AudioTranscript string `json:"audio_transcript,omitempty"`

	// ── Provenance ───────────────────────────────────────────────────────────
	// Where this annotation came from, and what the model had proposed before
	// the radiologist touched it. The pair (AIBBox, geometry above) is what a
	// retraining set is actually made of: a correction carries more information
	// than a fresh annotation, and a rejection is a labelled false positive.
	Source       AnnotationSource `json:"source,omitempty"`
	ModelID      string           `json:"model_id,omitempty"`
	AIConfidence float64          `json:"ai_confidence,omitempty"`
	AIKind       string           `json:"ai_kind,omitempty"`
	AIBirads     string           `json:"ai_birads,omitempty"`
	// Geometry exactly as the model suggested it, before any human correction.
	AIBBox *BoundingBox `json:"ai_bbox,omitempty"`
}

// AnnotationSource records how an annotation came to exist.
//
// It is the persisted counterpart of FindingSource, which until now only ever
// existed in memory: the sidecar marked findings as AI-produced, and that fact
// was dropped on the way to the database.
type AnnotationSource string

const (
	// SourceManual — drawn by the radiologist from scratch.
	SourceManual AnnotationSource = "manual"
	// SourceAIAccepted — an AI suggestion taken as-is.
	SourceAIAccepted AnnotationSource = "ai_accepted"
	// SourceAIEdited — an AI suggestion whose geometry the radiologist changed.
	SourceAIEdited AnnotationSource = "ai_edited"
	// SourceAIRejected — an AI suggestion the radiologist discarded. Carries no
	// human geometry: only AIBBox, the box the model got wrong.
	SourceAIRejected AnnotationSource = "ai_rejected"
)

// IsAIDerived reports whether the annotation originated from a model suggestion.
func (s AnnotationSource) IsAIDerived() bool {
	return s == SourceAIAccepted || s == SourceAIEdited || s == SourceAIRejected
}

// Normalize maps an empty or unknown source onto manual, so rows written before
// provenance existed read back as what they are.
func (s AnnotationSource) Normalize() AnnotationSource {
	switch s {
	case SourceAIAccepted, SourceAIEdited, SourceAIRejected:
		return s
	default:
		return SourceManual
	}
}

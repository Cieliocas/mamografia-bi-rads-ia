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

	// Voice note metadata. AudioPath is relative to MAMMO_LOCAL_ROOT/audio/.
	AudioPath       string `json:"audio_path,omitempty"`
	AudioDurationMs int    `json:"audio_duration_ms,omitempty"`
	AudioTranscript string `json:"audio_transcript,omitempty"`
}

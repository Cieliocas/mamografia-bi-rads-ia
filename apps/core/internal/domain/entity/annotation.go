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
	X float64
	Y float64
}

// BoundingBox is axis-aligned; X/Y is the top-left corner.
type BoundingBox struct {
	X      float64
	Y      float64
	Width  float64
	Height float64
}

type Polygon struct {
	Points []Point
}

// Annotation is a tagged union; exactly one of BBox/Polygon/Point is set
// according to Kind.
type Annotation struct {
	ID      AnnotationID
	Kind    AnnotationKind
	BBox    *BoundingBox
	Polygon *Polygon
	Point   *Point
}

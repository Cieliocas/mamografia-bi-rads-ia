package valueobject

import "fmt"

// Laterality represents which breast the image refers to.
type Laterality struct {
	value string
}

const (
	LateralityLeft  = "L"
	LateralityRight = "R"
)

func NewLaterality(raw string) (Laterality, error) {
	switch raw {
	case LateralityLeft, LateralityRight:
		return Laterality{value: raw}, nil
	default:
		return Laterality{}, fmt.Errorf("invalid laterality %q (expected L or R)", raw)
	}
}

func (l Laterality) String() string { return l.value }
func (l Laterality) IsLeft() bool   { return l.value == LateralityLeft }
func (l Laterality) IsRight() bool  { return l.value == LateralityRight }

// Projection represents the mammographic view.
type Projection struct {
	value string
}

const (
	ProjectionCC  = "CC"
	ProjectionMLO = "MLO"
)

func NewProjection(raw string) (Projection, error) {
	switch raw {
	case ProjectionCC, ProjectionMLO:
		return Projection{value: raw}, nil
	default:
		return Projection{}, fmt.Errorf("invalid projection %q (expected CC or MLO)", raw)
	}
}

func (p Projection) String() string { return p.value }

package valueobject

import "testing"

func TestLateralityValid(t *testing.T) {
	l, err := NewLaterality("L")
	if err != nil || !l.IsLeft() || l.IsRight() {
		t.Errorf("L case failed: %+v err=%v", l, err)
	}
	r, err := NewLaterality("R")
	if err != nil || !r.IsRight() || r.IsLeft() {
		t.Errorf("R case failed: %+v err=%v", r, err)
	}
}

func TestLateralityInvalid(t *testing.T) {
	for _, raw := range []string{"", "left", "X", "l"} {
		if _, err := NewLaterality(raw); err == nil {
			t.Errorf("NewLaterality(%q) expected error", raw)
		}
	}
}

func TestProjectionValid(t *testing.T) {
	for _, raw := range []string{"CC", "MLO"} {
		p, err := NewProjection(raw)
		if err != nil || p.String() != raw {
			t.Errorf("NewProjection(%q) failed: %+v err=%v", raw, p, err)
		}
	}
}

func TestProjectionInvalid(t *testing.T) {
	for _, raw := range []string{"", "ML", "cc", "AP"} {
		if _, err := NewProjection(raw); err == nil {
			t.Errorf("NewProjection(%q) expected error", raw)
		}
	}
}

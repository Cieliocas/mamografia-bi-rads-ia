package valueobject

import "testing"

func TestBIRADSCategoryValid(t *testing.T) {
	cases := []string{"0", "1", "2", "3", "4", "4A", "4B", "4C", "5", "6"}
	for _, raw := range cases {
		got, err := NewBIRADSCategory(raw)
		if err != nil {
			t.Errorf("NewBIRADSCategory(%q) unexpected error: %v", raw, err)
		}
		if got.String() != raw {
			t.Errorf("String() = %q, want %q", got.String(), raw)
		}
	}
}

func TestBIRADSCategoryInvalid(t *testing.T) {
	cases := []string{"", "7", "4D", "II", "null"}
	for _, raw := range cases {
		if _, err := NewBIRADSCategory(raw); err == nil {
			t.Errorf("NewBIRADSCategory(%q) expected error, got nil", raw)
		}
	}
}

func TestDensityValid(t *testing.T) {
	for _, raw := range []string{"A", "B", "C", "D"} {
		if _, err := NewDensity(raw); err != nil {
			t.Errorf("NewDensity(%q) unexpected error: %v", raw, err)
		}
	}
}

func TestDensityInvalid(t *testing.T) {
	for _, raw := range []string{"", "E", "a", "AA"} {
		if _, err := NewDensity(raw); err == nil {
			t.Errorf("NewDensity(%q) expected error", raw)
		}
	}
}

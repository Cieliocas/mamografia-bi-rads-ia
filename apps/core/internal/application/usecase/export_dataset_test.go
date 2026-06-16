package usecase

import "testing"

func TestBiradsCategoryID(t *testing.T) {
	cases := []struct {
		label string
		want  int
	}{
		{"BI-RADS 0", 1},
		{"BI-RADS 1", 2},
		{"BI-RADS 4", 5},
		{"BI-RADS 4A", 6},
		{"BI-RADS 4B", 7},
		{"BI-RADS 4C", 8},
		{"BI-RADS 5", 9},
		{"BI-RADS 6", 10},
		{"birads 4a", 6},                   // case-insensitive + lowercase subcategory
		{"BIRADS5", 9},                     // no hyphen, no space
		{"Nódulo espiculado BI-RADS 5", 9}, // embedded in free text
		{"Nódulo espiculado", catIDUnspecified},
		{"", catIDUnspecified},
		{"BI-RADS 7", catIDUnspecified}, // out of range → unspecified
	}
	for _, c := range cases {
		if got := biradsCategoryID(c.label); got != c.want {
			t.Errorf("biradsCategoryID(%q) = %d, want %d", c.label, got, c.want)
		}
	}
}

func TestCocoCategories(t *testing.T) {
	cats := cocoCategories()
	// 10 BI-RADS values + 1 unspecified.
	if len(cats) != len(biradsOrder)+1 {
		t.Fatalf("expected %d categories, got %d", len(biradsOrder)+1, len(cats))
	}
	// Ids must be contiguous starting at 1.
	for i, c := range cats {
		if c.ID != i+1 {
			t.Errorf("category[%d].ID = %d, want %d", i, c.ID, i+1)
		}
	}
	last := cats[len(cats)-1]
	if last.ID != catIDUnspecified || last.Name != "unspecified" {
		t.Errorf("last category = {%d, %q}, want {%d, %q}", last.ID, last.Name, catIDUnspecified, "unspecified")
	}
}

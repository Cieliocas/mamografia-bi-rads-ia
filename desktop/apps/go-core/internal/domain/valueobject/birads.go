package valueobject

import "fmt"

// BIRADSCategory represents the BI-RADS final assessment category.
// Valid values: 0, 1, 2, 3, 4, 4A, 4B, 4C, 5, 6.
type BIRADSCategory struct {
	value string
}

var validBIRADS = map[string]struct{}{
	"0":  {},
	"1":  {},
	"2":  {},
	"3":  {},
	"4":  {},
	"4A": {},
	"4B": {},
	"4C": {},
	"5":  {},
	"6":  {},
}

func NewBIRADSCategory(raw string) (BIRADSCategory, error) {
	if _, ok := validBIRADS[raw]; !ok {
		return BIRADSCategory{}, fmt.Errorf("invalid BI-RADS category %q", raw)
	}
	return BIRADSCategory{value: raw}, nil
}

func (b BIRADSCategory) String() string { return b.value }

// Density represents ACR breast composition (BI-RADS density A-D).
type Density struct {
	value string
}

var validDensity = map[string]struct{}{
	"A": {},
	"B": {},
	"C": {},
	"D": {},
}

func NewDensity(raw string) (Density, error) {
	if _, ok := validDensity[raw]; !ok {
		return Density{}, fmt.Errorf("invalid breast density %q", raw)
	}
	return Density{value: raw}, nil
}

func (d Density) String() string { return d.value }

package entity

import "time"

type PatientID string

// Patient is the clinical subject of one or more Studies. external_id is the
// PatientID DICOM tag (0010,0020); name/birth_date/sex are radiologist-editable
// and may diverge from the DICOM header (e.g. anonymized scans).
type Patient struct {
	ID         PatientID
	ExternalID string
	Name       string
	BirthDate  string // ISO YYYY-MM-DD; "" when unknown
	Sex        string // "F" | "M" | "O" | ""
	Notes      string
	CreatedAt  time.Time
}

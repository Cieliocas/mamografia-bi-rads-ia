package usecase

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// ExportFormat selects the output serialization.
type ExportFormat string

const (
	ExportJSON ExportFormat = "json"
	ExportCSV  ExportFormat = "csv"
	// TODO(plan-04): ExportCOCO ExportFormat = "coco"
	// TODO(plan-04): ExportDICOMSR ExportFormat = "dicom_sr"
)

// ExportDataset serializes studies + annotations for labelling pipelines.
type ExportDataset struct {
	studyRepo      outbound.StudyRepository
	annotationRepo outbound.AnnotationRepository
}

func NewExportDataset(sr outbound.StudyRepository, ar outbound.AnnotationRepository) *ExportDataset {
	return &ExportDataset{studyRepo: sr, annotationRepo: ar}
}

type ExportDatasetInput struct {
	StudyIDs []string     `json:"study_ids"` // empty = all studies
	Format   ExportFormat `json:"format"`
}

// Execute writes the exported data to w and returns the MIME content type.
func (uc *ExportDataset) Execute(ctx context.Context, in ExportDatasetInput, w io.Writer) (string, error) {
	studies, err := uc.resolveStudies(ctx, in.StudyIDs)
	if err != nil {
		return "", err
	}

	type record struct {
		StudyID     string `json:"study_id"`
		PatientID   string `json:"patient_id"`
		AnnotID     string `json:"annotation_id"`
		Kind        string `json:"kind"`
		X, Y, W, H float64
	}

	var rows []record
	for _, s := range studies {
		anns, err := uc.annotationRepo.LoadByStudyID(ctx, string(s.ID))
		if err != nil {
			return "", fmt.Errorf("load annotations for %s: %w", s.ID, err)
		}
		for _, a := range anns {
			r := record{
				StudyID:   string(s.ID),
				PatientID: s.PatientID,
				AnnotID:   string(a.ID),
				Kind:      string(a.Kind),
			}
			if a.BBox != nil {
				r.X, r.Y, r.W, r.H = a.BBox.X, a.BBox.Y, a.BBox.Width, a.BBox.Height
			} else if a.Point != nil {
				r.X, r.Y = a.Point.X, a.Point.Y
			}
			rows = append(rows, r)
		}
	}

	switch in.Format {
	case ExportCSV:
		return "text/csv", writeCSV(w, rows)
	default: // ExportJSON
		return "application/json", json.NewEncoder(w).Encode(rows)
	}
}

func (uc *ExportDataset) resolveStudies(ctx context.Context, ids []string) ([]*entity.Study, error) {
	if len(ids) == 0 {
		return uc.studyRepo.List(ctx)
	}
	studies := make([]*entity.Study, 0, len(ids))
	for _, id := range ids {
		s, err := uc.studyRepo.FindByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("study %s not found: %w", id, err)
		}
		studies = append(studies, s)
	}
	return studies, nil
}

type exportRow struct {
	StudyID   string
	PatientID string
	AnnotID   string
	Kind      string
	X, Y, W, H float64
}

func writeCSV(w io.Writer, rows interface{}) error {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"study_id", "patient_id", "annotation_id", "kind", "x", "y", "w", "h"})
	b, _ := json.Marshal(rows)
	var raw []map[string]interface{}
	_ = json.Unmarshal(b, &raw)
	for _, r := range raw {
		_ = cw.Write([]string{
			fmt.Sprint(r["study_id"]),
			fmt.Sprint(r["patient_id"]),
			fmt.Sprint(r["annotation_id"] ),
			fmt.Sprint(r["kind"]),
			fmt.Sprint(r["X"]),
			fmt.Sprint(r["Y"]),
			fmt.Sprint(r["W"]),
			fmt.Sprint(r["H"]),
		})
	}
	cw.Flush()
	return cw.Error()
}

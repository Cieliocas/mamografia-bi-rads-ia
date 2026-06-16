package usecase

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// ExportFormat selects the output serialization.
type ExportFormat string

const (
	ExportJSON ExportFormat = "json"
	ExportCSV  ExportFormat = "csv"
	ExportCOCO ExportFormat = "coco" // MS-COCO object-detection JSON, for training
)

// ExportDataset serializes studies + annotations for labelling pipelines.
type ExportDataset struct {
	studyRepo      outbound.StudyRepository
	annotationRepo outbound.AnnotationRepository
	// reader is optional; used only by the COCO export to read image
	// dimensions. nil-safe — dimensions fall back to 0 when unavailable.
	reader outbound.FilesystemReader
}

func NewExportDataset(sr outbound.StudyRepository, ar outbound.AnnotationRepository, reader outbound.FilesystemReader) *ExportDataset {
	return &ExportDataset{studyRepo: sr, annotationRepo: ar, reader: reader}
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

	// COCO needs the study→annotations hierarchy (not the flat row shape used
	// by JSON/CSV), so it has its own writer.
	if in.Format == ExportCOCO {
		return "application/json", uc.writeCOCO(ctx, studies, w)
	}

	type record struct {
		StudyID    string `json:"study_id"`
		PatientID  string `json:"patient_id"`
		AnnotID    string `json:"annotation_id"`
		Kind       string `json:"kind"`
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
	StudyID    string
	PatientID  string
	AnnotID    string
	Kind       string
	X, Y, W, H float64
}

// ── COCO export ──────────────────────────────────────────────────────────────
//
// Emits an MS-COCO object-detection dataset so the BI-RADS bounding-box
// annotations can train a detector (e.g. YOLOv8 via a COCO converter).
// Reference: https://cocodataset.org/#format-data

type cocoDataset struct {
	Info        cocoInfo         `json:"info"`
	Images      []cocoImage      `json:"images"`
	Annotations []cocoAnnotation `json:"annotations"`
	Categories  []cocoCategory   `json:"categories"`
}

type cocoInfo struct {
	Description string `json:"description"`
	Version     string `json:"version"`
}

type cocoImage struct {
	ID       int    `json:"id"`
	FileName string `json:"file_name"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

type cocoAnnotation struct {
	ID         int        `json:"id"`
	ImageID    int        `json:"image_id"`
	CategoryID int        `json:"category_id"`
	BBox       [4]float64 `json:"bbox"` // [x, y, w, h] top-left origin
	Area       float64    `json:"area"`
	IsCrowd    int        `json:"iscrowd"`
}

type cocoCategory struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Supercategory string `json:"supercategory"`
}

// biradsOrder defines the COCO category id for each BI-RADS value: the id is
// (index + 1). Values mirror valueobject.validBIRADS. It is an array (not a
// slice) so len() is a compile-time constant for catIDUnspecified.
var biradsOrder = [...]string{"0", "1", "2", "3", "4", "4A", "4B", "4C", "5", "6"}

// catIDUnspecified is assigned to boxes whose label carries no parseable
// BI-RADS category.
const catIDUnspecified = len(biradsOrder) + 1 // 11

var biradsLabelRE = regexp.MustCompile(`(?i)bi-?rads\s*([0-6](?:[abc])?)`)

// cocoCategories returns the fixed category list (stable ids).
func cocoCategories() []cocoCategory {
	cats := make([]cocoCategory, 0, len(biradsOrder)+1)
	for i, v := range biradsOrder {
		cats = append(cats, cocoCategory{ID: i + 1, Name: "BI-RADS " + v, Supercategory: "birads"})
	}
	cats = append(cats, cocoCategory{ID: catIDUnspecified, Name: "unspecified", Supercategory: "birads"})
	return cats
}

// biradsCategoryID maps an annotation label to a COCO category id.
func biradsCategoryID(label string) int {
	m := biradsLabelRE.FindStringSubmatch(label)
	if len(m) < 2 {
		return catIDUnspecified
	}
	val := strings.ToUpper(m[1])
	for i, v := range biradsOrder {
		if v == val {
			return i + 1
		}
	}
	return catIDUnspecified
}

// imageDims reads the DICOM/raster dimensions best-effort. Returns (0,0) when
// the reader is absent or the file can't be read — exporting must not fail just
// because one source image is missing.
func (uc *ExportDataset) imageDims(s *entity.Study) (int, int) {
	if uc.reader == nil || s.FilePath == "" {
		return 0, 0
	}
	_, meta, err := uc.reader.ReadDICOM(s.FilePath)
	if err != nil || meta == nil {
		return 0, 0
	}
	return meta.Columns, meta.Rows
}

func (uc *ExportDataset) writeCOCO(ctx context.Context, studies []*entity.Study, w io.Writer) error {
	ds := cocoDataset{
		Info:       cocoInfo{Description: "AIdentify mammography BI-RADS dataset", Version: "1.0"},
		Categories: cocoCategories(),
	}

	annID := 1
	for i, s := range studies {
		imgID := i + 1
		width, height := uc.imageDims(s)
		fileName := filepath.Base(s.FilePath)
		if fileName == "." || fileName == "/" {
			fileName = string(s.ID)
		}
		ds.Images = append(ds.Images, cocoImage{
			ID:       imgID,
			FileName: fileName,
			Width:    width,
			Height:   height,
		})

		anns, err := uc.annotationRepo.LoadByStudyID(ctx, string(s.ID))
		if err != nil {
			return fmt.Errorf("load annotations for %s: %w", s.ID, err)
		}
		for _, a := range anns {
			// COCO object detection is bounding-box based; skip point-only
			// annotations that have no box.
			if a.BBox == nil {
				continue
			}
			ds.Annotations = append(ds.Annotations, cocoAnnotation{
				ID:         annID,
				ImageID:    imgID,
				CategoryID: biradsCategoryID(a.Label),
				BBox:       [4]float64{a.BBox.X, a.BBox.Y, a.BBox.Width, a.BBox.Height},
				Area:       a.BBox.Width * a.BBox.Height,
				IsCrowd:    0,
			})
			annID++
		}
	}

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(ds)
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
			fmt.Sprint(r["annotation_id"]),
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

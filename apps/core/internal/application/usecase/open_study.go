package usecase

import (
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

func isRasterPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".png" || ext == ".jpg" || ext == ".jpeg"
}

// OpenStudy creates a Study from a file path, persisting it via the repository
// and ensuring a Patient row exists for the DICOM external_id.
type OpenStudy struct {
	repo    outbound.StudyRepository
	reader  outbound.FilesystemReader
	patient *EnsurePatient
}

func NewOpenStudy(repo outbound.StudyRepository, reader outbound.FilesystemReader, patient *EnsurePatient) *OpenStudy {
	return &OpenStudy{repo: repo, reader: reader, patient: patient}
}

type OpenStudyInput struct {
	FilePath string `json:"file_path"`
}

type OpenStudyOutput struct {
	Study    *entity.Study
	Patient  *entity.Patient
	Metadata *outbound.DICOMMetadata
	Width    int
	Height   int
}

func (uc *OpenStudy) Execute(ctx context.Context, in OpenStudyInput) (*OpenStudyOutput, error) {
	if in.FilePath == "" {
		return nil, fmt.Errorf("file_path is required")
	}

	// ── Raster image (PNG / JPG / JPEG) ──────────────────────────────────────
	if isRasterPath(in.FilePath) {
		return uc.openRaster(ctx, in.FilePath)
	}

	// ── DICOM ─────────────────────────────────────────────────────────────────
	pixels, meta, err := uc.reader.ReadDICOM(in.FilePath)
	if err != nil {
		return nil, fmt.Errorf("read dicom: %w", err)
	}

	patient, err := uc.patient.Execute(ctx, meta.PatientID)
	if err != nil {
		return nil, fmt.Errorf("ensure patient: %w", err)
	}

	// Reuse an existing study for this file path so that previously saved
	// annotations, clinical fields and voice notes are still accessible.
	// Only create a new study row when this file has never been opened before.
	study, err := uc.repo.FindByFilePath(ctx, in.FilePath)
	if err != nil {
		return nil, fmt.Errorf("lookup study by path: %w", err)
	}
	if study == nil {
		study = &entity.Study{
			ID:          entity.StudyID(uuid.NewString()),
			PatientID:   meta.PatientID,
			PatientUUID: string(patient.ID),
			StudyDate:   time.Now(),
			FilePath:    in.FilePath,
			CreatedAt:   time.Now(),
		}
		if err := uc.repo.Save(ctx, study); err != nil {
			return nil, fmt.Errorf("save study: %w", err)
		}
	}

	return &OpenStudyOutput{
		Study:    study,
		Patient:  patient,
		Metadata: meta,
		Width:    pixels.Width,
		Height:   pixels.Height,
	}, nil
}

// openRaster handles PNG / JPG / JPEG files: reads dimensions, stores a study
// with a synthetic patient, and returns metadata so the caller can display the
// image via /preview (which serves raster files directly).
func (uc *OpenStudy) openRaster(ctx context.Context, path string) (*OpenStudyOutput, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open image: %w", err)
	}
	cfg, _, err := image.DecodeConfig(f)
	f.Close()
	if err != nil {
		return nil, fmt.Errorf("decode image config: %w", err)
	}

	patientID := "UNKNOWN"
	patient, err := uc.patient.Execute(ctx, patientID)
	if err != nil {
		return nil, fmt.Errorf("ensure patient: %w", err)
	}

	// Reuse existing study for this raster path (same persistence logic as DICOM).
	study, err := uc.repo.FindByFilePath(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("lookup study by path: %w", err)
	}
	if study == nil {
		study = &entity.Study{
			ID:          entity.StudyID(uuid.NewString()),
			PatientID:   patientID,
			PatientUUID: string(patient.ID),
			StudyDate:   time.Now(),
			FilePath:    path,
			CreatedAt:   time.Now(),
		}
		if err := uc.repo.Save(ctx, study); err != nil {
			return nil, fmt.Errorf("save study: %w", err)
		}
	}

	meta := &outbound.DICOMMetadata{
		PatientID:   patientID,
		Modality:    "IMG",
		Description: filepath.Base(path),
		FrameCount:  1,
	}
	return &OpenStudyOutput{
		Study:    study,
		Patient:  patient,
		Metadata: meta,
		Width:    cfg.Width,
		Height:   cfg.Height,
	}, nil
}

package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

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

	pixels, meta, err := uc.reader.ReadDICOM(in.FilePath)
	if err != nil {
		return nil, fmt.Errorf("read dicom: %w", err)
	}

	patient, err := uc.patient.Execute(ctx, meta.PatientID)
	if err != nil {
		return nil, fmt.Errorf("ensure patient: %w", err)
	}

	study := &entity.Study{
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

	return &OpenStudyOutput{
		Study:    study,
		Patient:  patient,
		Metadata: meta,
		Width:    pixels.Width,
		Height:   pixels.Height,
	}, nil
}

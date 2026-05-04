package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// OpenStudy creates a Study from a file path, persisting it via the repository.
type OpenStudy struct {
	repo   outbound.StudyRepository
	reader outbound.FilesystemReader
}

func NewOpenStudy(repo outbound.StudyRepository, reader outbound.FilesystemReader) *OpenStudy {
	return &OpenStudy{repo: repo, reader: reader}
}

type OpenStudyInput struct {
	FilePath string `json:"file_path"`
}

type OpenStudyOutput struct {
	Study    *entity.Study
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

	study := &entity.Study{
		ID:        entity.StudyID(uuid.NewString()),
		PatientID: meta.PatientID,
		StudyDate: time.Now(),
		FilePath:  in.FilePath,
		CreatedAt: time.Now(),
	}

	if err := uc.repo.Save(ctx, study); err != nil {
		return nil, fmt.Errorf("save study: %w", err)
	}

	return &OpenStudyOutput{
		Study:    study,
		Metadata: meta,
		Width:    pixels.Width,
		Height:   pixels.Height,
	}, nil
}

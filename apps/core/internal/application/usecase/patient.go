package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// EnsurePatient looks up a Patient by DICOM external_id and creates a stub
// when missing. Used by OpenStudy so every imported scan has a Patient row,
// even before the radiologist edits the name.
type EnsurePatient struct {
	repo outbound.PatientRepository
}

func NewEnsurePatient(repo outbound.PatientRepository) *EnsurePatient {
	return &EnsurePatient{repo: repo}
}

func (uc *EnsurePatient) Execute(ctx context.Context, externalID string) (*entity.Patient, error) {
	if existing, err := uc.repo.FindByExternalID(ctx, externalID); err != nil {
		return nil, fmt.Errorf("lookup patient: %w", err)
	} else if existing != nil {
		return existing, nil
	}
	p := &entity.Patient{
		ID:         entity.PatientID(uuid.NewString()),
		ExternalID: externalID,
		Name:       "",
		CreatedAt:  time.Now(),
	}
	if err := uc.repo.Save(ctx, p); err != nil {
		return nil, fmt.Errorf("save patient stub: %w", err)
	}
	return p, nil
}

// UpdatePatient applies a partial set of edits keyed by id. Pointer fields
// distinguish "leave alone" from "set to empty string".
type UpdatePatient struct {
	repo outbound.PatientRepository
}

func NewUpdatePatient(repo outbound.PatientRepository) *UpdatePatient {
	return &UpdatePatient{repo: repo}
}

type UpdatePatientInput struct {
	ID         string
	ExternalID *string
	Name       *string
	BirthDate  *string
	Sex        *string
	Notes      *string
}

func (uc *UpdatePatient) Execute(ctx context.Context, in UpdatePatientInput) (*entity.Patient, error) {
	p, err := uc.repo.FindByID(ctx, in.ID)
	if err != nil {
		return nil, fmt.Errorf("patient not found: %w", err)
	}
	if in.ExternalID != nil { p.ExternalID = *in.ExternalID }
	if in.Name       != nil { p.Name       = *in.Name }
	if in.BirthDate  != nil { p.BirthDate  = *in.BirthDate }
	if in.Sex        != nil { p.Sex        = *in.Sex }
	if in.Notes      != nil { p.Notes      = *in.Notes }
	if err := uc.repo.Save(ctx, p); err != nil {
		return nil, fmt.Errorf("save patient: %w", err)
	}
	return p, nil
}

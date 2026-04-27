package usecase

import (
	"context"
	"errors"

	"mammo/apps/core/internal/infrastructure/pdi"
)

// WindowingInput is the input DTO for apply_windowing — no gin types.
type WindowingInput struct {
	Pixels       []int16 `json:"pixels"`
	WindowCenter float64 `json:"window_center"`
	WindowWidth  float64 `json:"window_width"`
}

// WindowingOutput carries the normalized 8-bit pixel buffer.
type WindowingOutput struct {
	Pixels []uint8 `json:"pixels"`
}

// ApplyWindowing converts 16-bit DICOM pixels to 8-bit display values
// using the provided window center and width parameters.
type ApplyWindowing struct{}

func NewApplyWindowing() *ApplyWindowing { return &ApplyWindowing{} }

func (uc *ApplyWindowing) Execute(_ context.Context, in WindowingInput) (*WindowingOutput, error) {
	if len(in.Pixels) == 0 {
		return nil, errors.New("pixel buffer is empty")
	}
	out, err := pdi.ApplyWindowing(in.Pixels, in.WindowCenter, in.WindowWidth)
	if err != nil {
		return nil, err
	}
	return &WindowingOutput{Pixels: out}, nil
}

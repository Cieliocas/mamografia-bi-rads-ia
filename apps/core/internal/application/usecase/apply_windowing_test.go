package usecase_test

import (
	"context"
	"testing"

	"mammo/apps/core/internal/application/usecase"
)

func TestApplyWindowingClamps(t *testing.T) {
	uc := usecase.NewApplyWindowing()
	in := usecase.WindowingInput{
		Pixels:       []int16{-1000, 0, 1000},
		WindowCenter: 0,
		WindowWidth:  2000,
	}
	out, err := uc.Execute(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Pixels[0] != 0 {
		t.Errorf("expected 0 got %d", out.Pixels[0])
	}
	if out.Pixels[2] != 255 {
		t.Errorf("expected 255 got %d", out.Pixels[2])
	}
}

func TestApplyWindowingEmptyPixels(t *testing.T) {
	uc := usecase.NewApplyWindowing()
	_, err := uc.Execute(context.Background(), usecase.WindowingInput{})
	if err == nil {
		t.Fatal("expected error for empty pixels")
	}
}

func TestApplyWindowingZeroWidth(t *testing.T) {
	uc := usecase.NewApplyWindowing()
	_, err := uc.Execute(context.Background(), usecase.WindowingInput{
		Pixels:      []int16{100},
		WindowWidth: 0,
	})
	if err == nil {
		t.Fatal("expected error for zero width")
	}
}

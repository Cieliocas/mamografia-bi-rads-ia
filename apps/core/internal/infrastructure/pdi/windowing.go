package pdi

import (
	"errors"
)

// ApplyWindowing is intentionally simple here; in production this should be
// backed by SIMD/CGO for high-throughput DICOM pixel transforms.
func ApplyWindowing(pixels []int16, windowCenter float64, windowWidth float64) ([]uint8, error) {
	if len(pixels) == 0 {
		return nil, errors.New("empty pixel buffer")
	}
	if windowWidth <= 0 {
		return nil, errors.New("window width must be positive")
	}

	lower := windowCenter - (windowWidth / 2.0)
	upper := windowCenter + (windowWidth / 2.0)
	output := make([]uint8, len(pixels))

	for i, value := range pixels {
		pixel := float64(value)
		switch {
		case pixel <= lower:
			output[i] = 0
		case pixel >= upper:
			output[i] = 255
		default:
			normalized := (pixel - lower) / (upper - lower)
			output[i] = uint8(normalized * 255.0)
		}
	}

	return output, nil
}

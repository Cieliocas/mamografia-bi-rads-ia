package filesystem

import (
	"testing"
)

// buildMinimalSOF3 constructs a minimal valid JPEG Lossless (SOF3) byte stream
// in memory.  The image is 4×2 pixels, 8-bit precision, 1 component.
// Huffman table: SSSS=0 → bit "0".
// Scan: all DIFFs=0 → every pixel = initialPx = 2^(8-0-1) = 128.
func buildMinimalSOF3(width, height int) []byte {
	// ── SOI ──────────────────────────────────────────────────────────────────
	out := []byte{0xFF, 0xD8}

	// ── SOF3: P=8, Y=height, X=width, Nf=1 ─────────────────────────────────
	// Segment length = 2(len) + 1(P) + 2(Y) + 2(X) + 1(Nf) + 3*Nf = 11
	out = append(out,
		0xFF, 0xC3,
		0x00, 0x0B,     // length = 11
		0x08,           // P = 8
		byte(height>>8), byte(height), // Y
		byte(width>>8), byte(width),   // X
		0x01,           // Nf = 1
		0x01,           // C1 = 1
		0x11,           // H1 V1 (ignored in lossless)
		0x00,           // Tq1 = 0 (no quantisation in lossless)
	)

	// ── DHT: table 0 (DC), one code of length 1: "0" → SSSS=0 ───────────────
	// Segment length = 2 + 1(TcTh) + 16(BITS) + 1(HUFFVAL) = 20
	out = append(out,
		0xFF, 0xC4,
		0x00, 0x14, // length = 20
		0x00,       // Tc=0 (DC), Th=0
		// L[1..16]: one code of length 1
		0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// HUFFVAL: [0] → SSSS=0 mapped to bit sequence "0"
		0x00,
	)

	// ── SOS: Ns=1, Cs=1 Td=0 Ta=0, Ss=1 (predictor left), Se=0, Ah=0 Al=0 ─
	// Segment length = 2 + 1(Ns) + 2(Cs TdTa) + 1(Ss) + 1(Se) + 1(Ah Al) = 8
	out = append(out,
		0xFF, 0xDA,
		0x00, 0x08, // length = 8
		0x01,       // Ns = 1
		0x01,       // Cs = 1
		0x00,       // Td=0 Ta=0
		0x01,       // Ss = 1 (predictor: left neighbour)
		0x00,       // Se = 0
		0x00,       // Ah=0 Al=0 (no point transform)
	)

	// ── Entropy-coded data ───────────────────────────────────────────────────
	// For each of width*height pixels: Huffman code for SSSS=0 is the single
	// bit "0".  Pack into bytes (MSB first); last byte is padded with 1-bits.
	nBits := width * height // one bit per pixel (SSSS=0 → code "0")
	nBytes := (nBits + 7) / 8
	scanBytes := make([]byte, nBytes)
	// All bits are 0, so all bytes are 0 — already initialised.
	// The last partial byte needs padding with 1s (JPEG pad bits).
	rem := nBits % 8
	if rem != 0 {
		pad := byte((1 << (8 - rem)) - 1)
		scanBytes[nBytes-1] = pad
	}
	out = append(out, scanBytes...)

	// ── EOI ──────────────────────────────────────────────────────────────────
	out = append(out, 0xFF, 0xD9)

	return out
}

func TestDecodeLosslessJPEG_AllSame(t *testing.T) {
	const w, h = 4, 2
	data := buildMinimalSOF3(w, h)

	pix, err := decodeLosslessJPEG(data)
	if err != nil {
		t.Fatalf("decodeLosslessJPEG: %v", err)
	}
	if pix.Width != w || pix.Height != h {
		t.Fatalf("dimensions: want %dx%d, got %dx%d", w, h, pix.Width, pix.Height)
	}
	if len(pix.Data) != w*h {
		t.Fatalf("data length: want %d, got %d", w*h, len(pix.Data))
	}

	// initialPx = 2^(P-Pt-1) = 2^(8-0-1) = 128
	// All DIFFs = 0, so all reconstructed values = 128.
	// Note: predictor 1 (left neighbour) also propagates 128 across each row.
	want := int16(128)
	for i, v := range pix.Data {
		if v != want {
			t.Errorf("pixel[%d] = %d, want %d", i, v, want)
		}
	}
}

func TestDecodeLosslessJPEG_BadSOI(t *testing.T) {
	// Garbage input must return an error, not panic.
	_, err := decodeLosslessJPEG([]byte{0x00, 0x01, 0x02, 0x03})
	if err == nil {
		t.Fatal("expected error for missing SOI, got nil")
	}
}

func TestDecodeLosslessJPEG_TruncatedInput(t *testing.T) {
	// Valid SOI but nothing else.
	_, err := decodeLosslessJPEG([]byte{0xFF, 0xD8})
	if err == nil {
		t.Fatal("expected error for truncated input, got nil")
	}
}

// TestDecodeLosslessJPEG_Predictor1_GradientRow verifies that predictor 1
// correctly reconstructs a row where DIFF increments by 1 each pixel.
// We build a 4×1 image where the pixel values should be [128, 129, 130, 131].
// DIFF sequence: 128 (first pixel from initialPx=128, DIFF=0),
//   then 1, 1, 1 for subsequent pixels.
func TestDecodeLosslessJPEG_Predictor1_GradientRow(t *testing.T) {
	// Build a SOF3 stream for a 4×1 grayscale 8-bit image where:
	//   pixel 0 = 128 (initialPx + DIFF=0)
	//   pixel 1 = 129 (Ra=128 + DIFF=1)
	//   pixel 2 = 130 (Ra=129 + DIFF=1)
	//   pixel 3 = 131 (Ra=130 + DIFF=1)
	//
	// We need two Huffman codes: SSSS=0 (→code "0") and SSSS=1 (→code "10").
	// SSSS=1 means read 1 more bit: bit=1 → DIFF=1; bit=0 → DIFF=-1.

	// ── SOI ──────────────────────────────────────────────────────────────────
	out := []byte{0xFF, 0xD8}

	// ── SOF3: P=8, Y=1, X=4, Nf=1 ──────────────────────────────────────────
	out = append(out,
		0xFF, 0xC3,
		0x00, 0x0B,
		0x08,       // P=8
		0x00, 0x01, // Y=1
		0x00, 0x04, // X=4
		0x01,
		0x01, 0x11, 0x00,
	)

	// ── DHT: table 0, two codes: SSSS=0 → "0", SSSS=1 → "10" ──────────────
	// L[1]=1 (one code of length 1: "0"→SSSS=0)
	// L[2]=1 (one code of length 2: "10"→SSSS=1)
	// HUFFVAL = [0, 1]
	// Segment length = 2 + 1 + 16 + 2 = 21
	out = append(out,
		0xFF, 0xC4,
		0x00, 0x15, // length = 21
		0x00,       // Tc=0 Th=0
		// L[1..16]
		0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// HUFFVAL
		0x00, // SSSS=0 mapped to code of length 1
		0x01, // SSSS=1 mapped to code of length 2
	)

	// ── SOS ──────────────────────────────────────────────────────────────────
	out = append(out,
		0xFF, 0xDA,
		0x00, 0x08,
		0x01,
		0x01, 0x00,
		0x01,       // Ss=1 (predictor left)
		0x00,
		0x00,
	)

	// ── Entropy data ─────────────────────────────────────────────────────────
	// Pixel 0: SSSS=0 → bit "0"                       → 1 bit
	// Pixel 1: SSSS=1 → bits "10", then 1 bit "1"    → 3 bits  (DIFF=+1)
	// Pixel 2: SSSS=1 → bits "10", then 1 bit "1"    → 3 bits  (DIFF=+1)
	// Pixel 3: SSSS=1 → bits "10", then 1 bit "1"    → 3 bits  (DIFF=+1)
	// Total: 1+3+3+3 = 10 bits, packed in 2 bytes (MSB first).
	//
	// Bit sequence (MSB first):
	//   0   10 1   10 1   10 1   ______
	//   ^   ^^^ ^  ^^^ ^  ^^^ ^
	// pixel0 px1    px2    px3   padding
	//
	// 0 1 0 1 | 1 0 1 1 | 0 1 _ _  → but we need to pack correctly:
	// bits: 0, 1,0,1, 1,0,1, 1,0,1 → 10 bits
	// byte0: 0 1 0 1  1 0 1 1 = 0x5B  (bits 9..2)
	// byte1: 0 1 1 1  1 1 1 1 = 0x7F  (bits 1..0 + 6 padding 1-bits)
	//
	// Let me recount:
	// bit 9 (MSB of byte 0): SSSS=0 code → bit "0"           → 0
	// bit 8: SSSS=1 code → bit "1"                           → 1
	// bit 7: SSSS=1 code → bit "0"                           → 0
	// bit 6: DIFF for pixel 1 (SSSS=1) → bit "1" (=+1)      → 1
	// bit 5: SSSS=1 code → bit "1"                           → 1
	// bit 4: SSSS=1 code → bit "0"                           → 0
	// bit 3: DIFF for pixel 2 → bit "1"                      → 1
	// bit 2: SSSS=1 code → bit "1"                           → 1
	// bit 1: SSSS=1 code → bit "0"                           → 0
	// bit 0 (LSB of byte 0 would be bit 8 of the stream... let me redo)
	//
	// Pack MSB-first into bytes:
	// Stream: 0,  1,0,1,  1,0,1,  1,0,1  pad,pad,pad,pad,pad,pad
	// byte0: bits [0..7] = 0 1 0 1 1 0 1 1 = 0x5B
	// byte1: bits [8..9] = 0 1, then 6 pad-1s = 0 1 1 1 1 1 1 1 = 0x7F
	out = append(out, 0x5B, 0x7F)

	// ── EOI ──────────────────────────────────────────────────────────────────
	out = append(out, 0xFF, 0xD9)

	pix, err := decodeLosslessJPEG(out)
	if err != nil {
		t.Fatalf("decodeLosslessJPEG: %v", err)
	}
	if len(pix.Data) != 4 {
		t.Fatalf("expected 4 pixels, got %d", len(pix.Data))
	}
	want := [4]int16{128, 129, 130, 131}
	for i, w := range want {
		if pix.Data[i] != w {
			t.Errorf("pixel[%d] = %d, want %d", i, pix.Data[i], w)
		}
	}
}

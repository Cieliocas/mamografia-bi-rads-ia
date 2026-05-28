package filesystem

// Pure-Go decoder for JPEG Lossless (SOF3, Process 14 / SV1).
//
// Digital mammography stores most images in Transfer Syntax
// 1.2.840.10008.1.2.4.70 (JPEG Lossless Default – Process 14 SV1).
// Standard Go image/jpeg only handles lossy Baseline/Progressive (SOF0/SOF2);
// it cannot decode SOF3.  This file implements the subset that appears in
// clinical mammography files:
//   - Precision 8, 10, 12, or 16 bits per sample
//   - 1 component (grayscale; RGB DICOM files are decoded component-by-component)
//   - Predictors 1–7 (predictor 1 = left-neighbor is by far the most common)
//   - Huffman entropy coding (Annex C of ISO 10918-1)
//   - Byte stuffing removal (0xFF 0x00 → 0xFF in the compressed stream)
//   - Restart markers RST0–RST7
//
// References:
//   ISO/IEC 10918-1:1994 — Information technology – JPEG (Annexes B, C, H)
//   DICOM PS 3.5 §8.2.1 — JPEG Lossless Transfer Syntaxes

import (
	"encoding/binary"
	"fmt"

	"mammo/apps/core/internal/ports/outbound"
)

// JPEG marker codes (second byte after 0xFF).
const (
	jpgSOI  = 0xD8 // Start of Image
	jpgEOI  = 0xD9 // End of Image
	jpgSOF3 = 0xC3 // Start of Frame – Lossless Huffman
	jpgDHT  = 0xC4 // Define Huffman Table
	jpgSOS  = 0xDA // Start of Scan
	jpgDRI  = 0xDD // Define Restart Interval
)

// decodeLosslessJPEG decodes a raw JPEG Lossless byte slice (encapsulated
// DICOM frame data beginning with 0xFF 0xD8) into a Pixels16 struct.
func decodeLosslessJPEG(data []byte) (*outbound.Pixels16, error) {
	d := &losslessDec{buf: data}
	if err := d.parse(); err != nil {
		return nil, err
	}
	samples, err := d.decodeScan()
	if err != nil {
		return nil, err
	}
	return &outbound.Pixels16{
		Data:   samples,
		Width:  d.width,
		Height: d.height,
	}, nil
}

// ── Decoder state ─────────────────────────────────────────────────────────────

type losslessDec struct {
	buf []byte
	pos int

	// SOF3 fields
	prec   int // precision P (bits per sample)
	height int // Y
	width  int // X
	ncomp  int // Nf: number of components (we only support 1)

	// Per-component: Huffman DC table index
	compHuffID []int

	// SOS fields
	predictor int // Ss: 1–7
	ptXfrm    int // Al: point transform (0 in SV1)

	// Restart interval (DRI)
	restartInterval int

	// Huffman tables indexed [tableID 0..3]
	huffTabs [4]*lsHuffTable
}

// ── Huffman table ─────────────────────────────────────────────────────────────

// lsHuffTable stores a JPEG Huffman table using the canonical decode
// algorithm from ISO 10918-1 Annex F.2.2.3:
//
//	code ← nextbit ; SIZE ← 1
//	while code > MAXCODE[SIZE]: code ← (code<<1)|nextbit ; SIZE++
//	SYMBOL ← HUFFVAL[ VALPTR[SIZE] + code − MINCODE[SIZE] ]
type lsHuffTable struct {
	minCode [17]uint32 // smallest canonical code at each length (1-indexed)
	maxCode [17]int32  // largest canonical code at each length (−1 if none)
	valPtr  [17]int    // index into syms[] for the first code of each length
	syms    []byte     // HUFFVAL: symbol (SSSS category) for each Huffman code
}

// buildLsHuffTable constructs an lsHuffTable from the raw BITS (L[1..16])
// and HUFFVAL arrays as they appear in a DHT segment.
func buildLsHuffTable(bits [16]byte, vals []byte) *lsHuffTable {
	t := &lsHuffTable{}
	t.syms = make([]byte, len(vals))
	copy(t.syms, vals)

	// ISO 10918-1 Annex C.2: generate canonical codes
	code := uint32(0)
	k := 0 // index into vals
	for si := 1; si <= 16; si++ {
		n := int(bits[si-1])
		if n == 0 {
			t.maxCode[si] = -1
			code <<= 1
			continue
		}
		t.minCode[si] = code
		t.valPtr[si] = k
		code += uint32(n)
		t.maxCode[si] = int32(code - 1)
		k += n
		code <<= 1
	}
	return t
}

// decode reads the next Huffman symbol (SSSS category) from the bit reader.
func (t *lsHuffTable) decode(br *lsBitReader) (int, error) {
	code := uint32(0)
	for length := 1; length <= 16; length++ {
		bit, err := br.readBit()
		if err != nil {
			return 0, fmt.Errorf("jpeg-lossless: Huffman read: %w", err)
		}
		code = (code << 1) | uint32(bit)
		if t.maxCode[length] >= 0 && code <= uint32(t.maxCode[length]) {
			idx := t.valPtr[length] + int(code-t.minCode[length])
			if idx < 0 || idx >= len(t.syms) {
				return 0, fmt.Errorf("jpeg-lossless: Huffman table index %d out of range", idx)
			}
			return int(t.syms[idx]), nil
		}
	}
	return 0, fmt.Errorf("jpeg-lossless: no Huffman code matched")
}

// ── Bit reader with byte-stuffing removal ─────────────────────────────────────

type lsBitReader struct {
	src []byte // compressed scan data (already stripped of markers past SOS)
	pos int    // byte position
	buf byte   // current byte (partial)
	cnt int    // bits remaining in buf
}

func newLsBitReader(scan []byte) *lsBitReader { return &lsBitReader{src: scan} }

// readBit returns the next bit from the compressed stream.
// It handles byte stuffing: 0xFF 0x00 → 0xFF (only the 0xFF contributes bits;
// the 0x00 is a padding byte that is consumed but ignored).
func (br *lsBitReader) readBit() (uint32, error) {
	if br.cnt == 0 {
		if br.pos >= len(br.src) {
			return 0, fmt.Errorf("jpeg-lossless: unexpected end of scan data")
		}
		br.buf = br.src[br.pos]
		br.pos++
		br.cnt = 8
		// Byte stuffing: 0xFF is always followed by 0x00 in the scan stream.
		if br.buf == 0xFF {
			if br.pos < len(br.src) && br.src[br.pos] == 0x00 {
				br.pos++ // consume the stuffed 0x00
			}
			// Non-zero after 0xFF is a marker — we leave it unconsumed
			// (the caller should never reach a marker mid-scan if data is valid).
		}
	}
	br.cnt--
	return uint32(br.buf>>br.cnt) & 1, nil
}

// readBits reads n bits (MSB first) and returns them as a uint32.
func (br *lsBitReader) readBits(n int) (uint32, error) {
	var v uint32
	for i := 0; i < n; i++ {
		bit, err := br.readBit()
		if err != nil {
			return 0, err
		}
		v = (v << 1) | bit
	}
	return v, nil
}

// ── Marker / segment parsing ──────────────────────────────────────────────────

// readU8 reads one byte from the header buffer.
func (d *losslessDec) readU8() (byte, error) {
	if d.pos >= len(d.buf) {
		return 0, fmt.Errorf("jpeg-lossless: unexpected EOF at byte %d", d.pos)
	}
	b := d.buf[d.pos]
	d.pos++
	return b, nil
}

// readU16 reads a big-endian uint16 from the header buffer.
func (d *losslessDec) readU16() (uint16, error) {
	if d.pos+2 > len(d.buf) {
		return 0, fmt.Errorf("jpeg-lossless: unexpected EOF reading uint16")
	}
	v := binary.BigEndian.Uint16(d.buf[d.pos:])
	d.pos += 2
	return v, nil
}

// nextMarker advances to the next 0xFF XX marker and returns XX.
func (d *losslessDec) nextMarker() (byte, error) {
	for {
		b, err := d.readU8()
		if err != nil {
			return 0, err
		}
		if b != 0xFF {
			continue
		}
		for {
			m, err := d.readU8()
			if err != nil {
				return 0, err
			}
			if m != 0xFF { // padding FFs are skipped
				return m, nil
			}
		}
	}
}

// parse walks the JPEG header segments and fills the decoder state.
func (d *losslessDec) parse() error {
	// SOI
	if len(d.buf) < 2 || d.buf[0] != 0xFF || d.buf[1] != jpgSOI {
		return fmt.Errorf("jpeg-lossless: missing SOI marker")
	}
	d.pos = 2

	for {
		m, err := d.nextMarker()
		if err != nil {
			return fmt.Errorf("jpeg-lossless: marker scan: %w", err)
		}
		switch m {
		case jpgSOF3:
			if err := d.parseSOF3(); err != nil {
				return err
			}
		case jpgDHT:
			if err := d.parseDHT(); err != nil {
				return err
			}
		case jpgDRI:
			if err := d.parseDRI(); err != nil {
				return err
			}
		case jpgSOS:
			// SOS marks the start of entropy-coded data; parsing ends here.
			return d.parseSOS()
		case jpgEOI:
			return fmt.Errorf("jpeg-lossless: EOI before SOS")
		default:
			// Skip unknown / APP / COM segments using their length field.
			length, err := d.readU16()
			if err != nil {
				return fmt.Errorf("jpeg-lossless: reading segment length for marker %02X: %w", m, err)
			}
			if int(length) < 2 {
				return fmt.Errorf("jpeg-lossless: segment length %d < 2 for marker %02X", length, m)
			}
			d.pos += int(length) - 2
		}
	}
}

// parseSOF3 reads the Start of Frame (lossless) segment.
func (d *losslessDec) parseSOF3() error {
	length, err := d.readU16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + int(length)

	prec, err := d.readU8()
	if err != nil {
		return err
	}
	d.prec = int(prec)

	rows, err := d.readU16()
	if err != nil {
		return err
	}
	d.height = int(rows)

	cols, err := d.readU16()
	if err != nil {
		return err
	}
	d.width = int(cols)

	ncomp, err := d.readU8()
	if err != nil {
		return err
	}
	d.ncomp = int(ncomp)
	d.compHuffID = make([]int, d.ncomp)

	// Component specification: Ci (1B), Hi Vi (1B), Tqi (1B) — 3 bytes each.
	for i := 0; i < d.ncomp; i++ {
		if d.pos+3 > end {
			break
		}
		d.pos++ // Ci: component identifier (ignored)
		d.pos++ // Hi Vi: sampling factors (ignored for lossless)
		d.pos++ // Tqi: quantisation table (0 for lossless)
	}
	d.pos = end
	return nil
}

// parseDHT reads a Define Huffman Table segment (may contain multiple tables).
func (d *losslessDec) parseDHT() error {
	length, err := d.readU16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + int(length)

	for d.pos < end {
		tcth, err := d.readU8()
		if err != nil {
			return err
		}
		tableClass := (tcth >> 4) & 0xF // 0 = DC (the only class in lossless)
		tableID := int(tcth & 0xF)
		_ = tableClass

		if tableID > 3 {
			return fmt.Errorf("jpeg-lossless: DHT table ID %d > 3", tableID)
		}

		// BITS: 16 bytes L[1..16]
		if d.pos+16 > len(d.buf) {
			return fmt.Errorf("jpeg-lossless: DHT truncated")
		}
		var bits [16]byte
		copy(bits[:], d.buf[d.pos:d.pos+16])
		d.pos += 16

		// Count total symbols
		total := 0
		for _, b := range bits {
			total += int(b)
		}
		if d.pos+total > len(d.buf) {
			return fmt.Errorf("jpeg-lossless: DHT HUFFVAL truncated (need %d bytes)", total)
		}
		vals := make([]byte, total)
		copy(vals, d.buf[d.pos:d.pos+total])
		d.pos += total

		d.huffTabs[tableID] = buildLsHuffTable(bits, vals)
	}
	d.pos = end
	return nil
}

// parseDRI reads a Define Restart Interval segment.
func (d *losslessDec) parseDRI() error {
	length, err := d.readU16()
	if err != nil {
		return err
	}
	if length < 4 {
		return fmt.Errorf("jpeg-lossless: DRI segment too short")
	}
	ri, err := d.readU16()
	if err != nil {
		return err
	}
	d.restartInterval = int(ri)
	d.pos += int(length) - 4
	return nil
}

// parseSOS reads the Start of Scan segment header.
// After this call d.pos points at the first byte of the entropy-coded data.
func (d *losslessDec) parseSOS() error {
	length, err := d.readU16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + int(length)

	ns, err := d.readU8()
	if err != nil {
		return err
	}
	// Component selectors + Huffman table IDs
	for i := 0; i < int(ns); i++ {
		d.pos++ // Cs: component selector
		tdta, err := d.readU8()
		if err != nil {
			return err
		}
		if i < len(d.compHuffID) {
			d.compHuffID[i] = int((tdta >> 4) & 0xF) // Td: DC table (Ta must be 0 in lossless)
		}
	}
	// Ss: predictor selection (1–7; 0 means "2-pass" not used in DICOM)
	ss, err := d.readU8()
	if err != nil {
		return err
	}
	d.predictor = int(ss)
	if d.predictor < 1 || d.predictor > 7 {
		d.predictor = 1 // default to left-neighbor (SV1)
	}

	d.pos++ // Se: 0 for lossless (end of spectral selection — not used)

	ahAl, err := d.readU8()
	if err != nil {
		return err
	}
	d.ptXfrm = int(ahAl & 0xF) // Al: point transform
	_ = end
	d.pos = end // entropy-coded data starts right after SOS segment
	return nil
}

// ── Scan decoding ─────────────────────────────────────────────────────────────

// decodeScan decodes the entropy-coded scan and returns int16 pixels.
func (d *losslessDec) decodeScan() ([]int16, error) {
	if d.width <= 0 || d.height <= 0 {
		return nil, fmt.Errorf("jpeg-lossless: invalid dimensions %dx%d", d.width, d.height)
	}
	if d.ncomp < 1 {
		return nil, fmt.Errorf("jpeg-lossless: no components")
	}

	// Validate Huffman tables for all components
	for i := 0; i < d.ncomp; i++ {
		id := d.compHuffID[i]
		if id > 3 || d.huffTabs[id] == nil {
			return nil, fmt.Errorf("jpeg-lossless: component %d references undefined Huffman table %d", i, id)
		}
	}

	// The scan data is everything from d.pos to the end of the buffer
	// (the EOI marker may be present at the tail).
	scanData := d.buf[d.pos:]
	br := newLsBitReader(scanData)

	nPixels := d.height * d.width
	out := make([]int16, nPixels*d.ncomp)

	// For multi-component scans (rare in DICOM), pixels are interleaved.
	// We decode each component's row of samples in parallel.
	// For 1-component (99% of mammography), this simplifies to a single scan.

	// previous holds the last reconstructed sample for each component (for
	// row-wrap prediction: Ra at the start of a new row = first sample of
	// the previous row).
	prev := make([]int, d.ncomp) // Ra for predictor 1

	// above is the full row above (for predictors 2–7).
	above := make([][]int, d.ncomp)
	for c := 0; c < d.ncomp; c++ {
		above[c] = make([]int, d.width)
	}

	// Initialise all above-row values to the default first-row predictor.
	initialPx := 1 << (d.prec - d.ptXfrm - 1) // 2^(P−Pt−1)
	for c := 0; c < d.ncomp; c++ {
		for x := 0; x < d.width; x++ {
			above[c][x] = initialPx
		}
	}

	restartCount := 0

	for y := 0; y < d.height; y++ {
		for x := 0; x < d.width; x++ {
			for c := 0; c < d.ncomp; c++ {
				// --- Compute prediction Px ---
				var Ra, Rb, Rc int
				if x > 0 {
					Ra = int(out[((y*d.width + x - 1)*d.ncomp + c)])
				} else {
					// Start of row: Ra is the first sample of the previous row
					// (ISO 10918-1 H.1.2.1: for x=0, Ra = Rb from previous row x=0)
					Ra = above[c][0]
				}
				Rb = above[c][x]
				if x > 0 {
					Rc = above[c][x-1]
				} else {
					Rc = above[c][0]
				}

				var Px int
				if y == 0 && x == 0 {
					// Very first sample: default predictor
					Px = initialPx
				} else if y == 0 {
					// First row: only left neighbour is valid
					Px = Ra
				} else if x == 0 {
					// First column: only above neighbour is valid
					Px = Rb
				} else {
					Px = d.predict(Ra, Rb, Rc)
				}

				// --- Decode DIFF ---
				htab := d.huffTabs[d.compHuffID[c]]
				ssss, err := htab.decode(br)
				if err != nil {
					return nil, fmt.Errorf("jpeg-lossless: y=%d x=%d comp=%d: %w", y, x, c, err)
				}

				var diff int
				if ssss == 0 {
					diff = 0
				} else if ssss == 16 {
					// Special case: DIFF = -32768 (ISO 10918-1 Table H.2)
					diff = -32768
				} else {
					raw, err := br.readBits(ssss)
					if err != nil {
						return nil, fmt.Errorf("jpeg-lossless: reading %d bits: %w", ssss, err)
					}
					// Two's-complement extend (ISO 10918-1 Annex F.2.2.1)
					thresh := uint32(1) << (ssss - 1)
					if raw < thresh {
						diff = int(raw) - int(thresh<<1) + 1
					} else {
						diff = int(raw)
					}
				}

				// --- Reconstruct sample ---
				// R = (Px + DIFF) mod 2^P
				mask := (1 << d.prec) - 1
				reconstructed := (Px + diff) & mask

				idx := (y*d.width + x) * d.ncomp + c
				out[idx] = int16(reconstructed)

				// Update state for next iteration
				above[c][x] = reconstructed
				prev[c] = reconstructed
				_ = prev
			}

			// Handle restart markers
			if d.restartInterval > 0 {
				restartCount++
				if restartCount == d.restartInterval && (y*d.width+x+1) < nPixels {
					restartCount = 0
					// Consume the RST marker from the scan stream
					if err := br.consumeRestartMarker(); err != nil {
						return nil, err
					}
					// Reset prediction state
					for c := 0; c < d.ncomp; c++ {
						for xx := 0; xx < d.width; xx++ {
							above[c][xx] = initialPx
						}
					}
				}
			}
		}
	}

	return out, nil
}

// predict applies the JPEG Lossless predictor (ISO 10918-1 Table H.1).
func (d *losslessDec) predict(Ra, Rb, Rc int) int {
	switch d.predictor {
	case 1:
		return Ra
	case 2:
		return Rb
	case 3:
		return Rc
	case 4:
		return Ra + Rb - Rc
	case 5:
		return Ra + (Rb-Rc)/2
	case 6:
		return Rb + (Ra-Rc)/2
	case 7:
		return (Ra + Rb) / 2
	default:
		return Ra
	}
}

// consumeRestartMarker skips to and past the next RST0–RST7 marker in the
// bit stream.  In lossless JPEG the markers appear on byte boundaries.
func (br *lsBitReader) consumeRestartMarker() error {
	// Discard remaining bits in the current byte (byte-align)
	br.cnt = 0

	// Find 0xFF followed by 0xD0–0xD7
	for {
		if br.pos >= len(br.src) {
			return fmt.Errorf("jpeg-lossless: restart marker not found")
		}
		b := br.src[br.pos]
		br.pos++
		if b == 0xFF && br.pos < len(br.src) {
			m := br.src[br.pos]
			if m >= 0xD0 && m <= 0xD7 {
				br.pos++ // consume the marker byte
				return nil
			}
			// Not a RST marker — backtrack one byte and keep searching
			// (shouldn't normally happen in valid data).
		}
	}
}

package filesystem

// Pure-Go decoder for JPEG-LS (ISO/IEC 14495-1 / ITU-T T.87), the LOCO-I
// algorithm. Used by some mammography units (GE Senographe, Kodak DirectView)
// for DICOM Transfer Syntaxes 1.2.840.10008.1.2.4.80 (lossless) and .81
// (near-lossless). Standard image/jpeg cannot decode it.
//
// Scope: single-component (grayscale) scans, precision 2–16 bits, regular and
// run modes, NEAR ≥ 0. This covers every JPEG-LS variant seen in clinical
// mammography. Multi-component interleaved scans are not implemented.
//
// The integer arithmetic mirrors the reference implementation (CharLS) and the
// standard's code segments (A.10–A.23) so it can be checked against them
// directly: Ra/Rb/Rc/Rd, A/B/C/N, Q, k, MErrval, and the run contexts (A/N/Nn).

import (
	"encoding/binary"
	"fmt"

	"mammo/apps/core/internal/ports/outbound"
)

// JPEG-LS marker codes (second byte after 0xFF).
const (
	jlsSOI   = 0xD8 // Start of Image
	jlsEOI   = 0xD9 // End of Image
	jlsSOF55 = 0xF7 // Start of Frame (JPEG-LS)
	jlsSOS   = 0xDA // Start of Scan
	jlsLSE   = 0xF8 // JPEG-LS preset parameters
)

// runIndexJ is the order array J used to derive run lengths (T.87 A.7).
var runIndexJ = [32]int{
	0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
	4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15,
}

// decodeJPEGLSFrame decodes an encapsulated JPEG-LS frame into a Pixels16.
// Signed/Photometric are filled in by the caller from the DICOM header.
func decodeJPEGLSFrame(data []byte) (*outbound.Pixels16, error) {
	px, w, h, err := decodeJPEGLS(data)
	if err != nil {
		return nil, err
	}
	return &outbound.Pixels16{Data: px, Width: w, Height: h}, nil
}

// decodeJPEGLS decodes a JPEG-LS codestream (starting with 0xFF 0xD8) into a
// 16-bit grayscale pixel buffer.
func decodeJPEGLS(data []byte) ([]int16, int, int, error) {
	d := &jlsDec{buf: data}
	if err := d.parseHeaders(); err != nil {
		return nil, 0, 0, err
	}
	if d.ncomp != 1 {
		return nil, 0, 0, fmt.Errorf("jpeg-ls: %d components not supported (only grayscale)", d.ncomp)
	}
	out, err := d.decodeScan()
	if err != nil {
		return nil, 0, 0, err
	}
	return out, d.width, d.height, nil
}

// ── Decoder state ─────────────────────────────────────────────────────────────

type jlsDec struct {
	buf []byte
	pos int

	// SOF55
	prec   int
	height int
	width  int
	ncomp  int

	// Coding parameters
	maxval int
	near   int
	t1     int
	t2     int
	t3     int
	reset  int

	// Derived
	qbpp  int
	limit int

	// Regular-mode contexts, indices 0..364 (= |context id|).
	a [365]int
	b [365]int
	c [365]int
	n [365]int

	// Run-interruption contexts, indexed by RItype (0 or 1).
	runA  [2]int
	runN  [2]int
	runNn [2]int

	runIndex int
	br       *jlsBitReader
}

// ── Bit reader with JPEG-LS bit stuffing ──────────────────────────────────────
//
// JPEG-LS avoids marker emulation by stuffing: whenever a 0xFF byte is emitted,
// the next byte carries only 7 data bits (its MSB is a 0 stuff bit), so the
// reader skips that stuff bit.

type jlsBitReader struct {
	src    []byte
	pos    int
	cur    byte
	bits   int
	prevFF bool
}

func newJLSBitReader(src []byte) *jlsBitReader { return &jlsBitReader{src: src} }

func (br *jlsBitReader) readBit() int {
	if br.bits == 0 {
		if br.pos >= len(br.src) {
			return 0 // pad with zeros past the end of stream
		}
		b := br.src[br.pos]
		br.pos++
		if br.prevFF {
			br.cur = b & 0x7F
			br.bits = 7
		} else {
			br.cur = b
			br.bits = 8
		}
		br.prevFF = b == 0xFF
	}
	br.bits--
	return int(br.cur>>br.bits) & 1
}

func (br *jlsBitReader) readBits(n int) int {
	v := 0
	for i := 0; i < n; i++ {
		v = (v << 1) | br.readBit()
	}
	return v
}

// readUnary counts leading 0 bits up to the terminating 1 (T.87 A.5.3).
func (br *jlsBitReader) readUnary() int {
	count := 0
	for br.readBit() == 0 {
		count++
		if count > 1<<20 {
			return count // safety valve against corrupt input
		}
	}
	return count
}

// ── Header parsing ────────────────────────────────────────────────────────────

func (d *jlsDec) u8() (int, error) {
	if d.pos >= len(d.buf) {
		return 0, fmt.Errorf("jpeg-ls: unexpected EOF")
	}
	b := d.buf[d.pos]
	d.pos++
	return int(b), nil
}

func (d *jlsDec) u16() (int, error) {
	if d.pos+2 > len(d.buf) {
		return 0, fmt.Errorf("jpeg-ls: unexpected EOF (u16)")
	}
	v := int(binary.BigEndian.Uint16(d.buf[d.pos:]))
	d.pos += 2
	return v, nil
}

func (d *jlsDec) parseHeaders() error {
	if len(d.buf) < 2 || d.buf[0] != 0xFF || d.buf[1] != jlsSOI {
		return fmt.Errorf("jpeg-ls: missing SOI marker")
	}
	d.pos = 2
	d.reset = 64 // default (overridden by LSE)

	for {
		b, err := d.u8()
		if err != nil {
			return err
		}
		if b != 0xFF {
			continue
		}
		var m int
		for {
			m, err = d.u8()
			if err != nil {
				return err
			}
			if m != 0xFF {
				break
			}
		}
		switch m {
		case jlsSOF55:
			if err := d.parseSOF55(); err != nil {
				return err
			}
		case jlsLSE:
			if err := d.parseLSE(); err != nil {
				return err
			}
		case jlsSOS:
			return d.parseSOS()
		case jlsEOI:
			return fmt.Errorf("jpeg-ls: EOI before SOS")
		case 0x01, 0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7:
			// Standalone markers — no length field.
		default:
			length, err := d.u16()
			if err != nil {
				return err
			}
			if length < 2 {
				return fmt.Errorf("jpeg-ls: bad segment length %d", length)
			}
			d.pos += length - 2
		}
	}
}

func (d *jlsDec) parseSOF55() error {
	length, err := d.u16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + length
	if d.prec, err = d.u8(); err != nil {
		return err
	}
	if d.height, err = d.u16(); err != nil {
		return err
	}
	if d.width, err = d.u16(); err != nil {
		return err
	}
	if d.ncomp, err = d.u8(); err != nil {
		return err
	}
	d.pos = end
	return nil
}

func (d *jlsDec) parseLSE() error {
	length, err := d.u16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + length
	id, err := d.u8()
	if err != nil {
		return err
	}
	if id == 1 { // preset coding parameters
		for _, p := range []*int{&d.maxval, &d.t1, &d.t2, &d.t3, &d.reset} {
			if *p, err = d.u16(); err != nil {
				return err
			}
		}
	}
	d.pos = end
	return nil
}

func (d *jlsDec) parseSOS() error {
	length, err := d.u16()
	if err != nil {
		return err
	}
	end := d.pos - 2 + length
	ns, err := d.u8()
	if err != nil {
		return err
	}
	d.pos += 2 * ns // component selectors + mapping tables
	if d.near, err = d.u8(); err != nil {
		return err
	}
	d.pos = end // ILV + point transform — single component, ignored
	return nil
}

// ── Parameter / context initialisation (T.87 A.2 / A.8) ───────────────────────

func (d *jlsDec) initParams() {
	if d.maxval == 0 {
		d.maxval = (1 << d.prec) - 1
	}
	if d.reset == 0 {
		d.reset = 64
	}

	rng := d.maxval + 1
	if d.near > 0 {
		rng = (d.maxval+2*d.near)/(2*d.near+1) + 1
	}
	bpp := max2(2, ceilLog2(d.maxval+1))
	d.qbpp = ceilLog2(rng)
	d.limit = 2 * (bpp + max2(8, bpp))

	if d.t1 == 0 && d.t2 == 0 && d.t3 == 0 {
		d.computeDefaultThresholds()
	}

	initA := max2(2, (rng+32)/64)
	for i := 0; i < 365; i++ {
		d.a[i] = initA
		d.b[i] = 0
		d.c[i] = 0
		d.n[i] = 1
	}
	for i := 0; i < 2; i++ {
		d.runA[i] = initA
		d.runN[i] = 1
		d.runNn[i] = 0
	}
	d.runIndex = 0
}

func (d *jlsDec) computeDefaultThresholds() {
	const bt1, bt2, bt3 = 3, 7, 21
	mv := d.maxval
	if mv >= 128 {
		factor := (min2(mv, 4095) + 128) / 256
		d.t1 = clampInt(factor*(bt1-2)+2+3*d.near, d.near+1, mv)
		d.t2 = clampInt(factor*(bt2-3)+3+5*d.near, d.t1, mv)
		d.t3 = clampInt(factor*(bt3-4)+4+7*d.near, d.t2, mv)
	} else {
		factor := 256 / (mv + 1)
		d.t1 = clampInt(bt1/factor+3*d.near, d.near+1, mv)
		d.t2 = clampInt(bt2/factor+5*d.near, d.t1, mv)
		d.t3 = clampInt(bt3/factor+7*d.near, d.t2, mv)
	}
}

// ── Scan decoding ─────────────────────────────────────────────────────────────

func (d *jlsDec) decodeScan() ([]int16, error) {
	if d.width <= 0 || d.height <= 0 {
		return nil, fmt.Errorf("jpeg-ls: invalid dimensions %dx%d", d.width, d.height)
	}
	d.initParams()
	d.br = newJLSBitReader(d.buf[d.pos:])

	out := make([]int16, d.width*d.height)
	prev := make([]int, d.width) // previous reconstructed line (zeros for line 0)
	cur := make([]int, d.width)

	raStartPrev := 0
	for y := 0; y < d.height; y++ {
		raStart, rcStart := 0, 0
		if y > 0 {
			raStart = prev[0] // Ra(x=0) = sample directly above (T.87 A.2)
			rcStart = raStartPrev
		}

		x := 0
		for x < d.width {
			var ra, rb, rc, rd int
			if x == 0 {
				ra, rc = raStart, rcStart
			} else {
				ra, rc = cur[x-1], prev[x-1]
			}
			rb = prev[x]
			if x == d.width-1 {
				rd = prev[x] // Rd = Rb at last column
			} else {
				rd = prev[x+1]
			}

			q1 := d.quantize(rd - rb)
			q2 := d.quantize(rb - rc)
			q3 := d.quantize(rc - ra)
			qs := 81*q1 + 9*q2 + q3

			if qs == 0 {
				// ── Run mode ──────────────────────────────────────────────────
				remaining := d.width - x
				runLen := d.decodeRunPixels(remaining)
				for i := 0; i < runLen; i++ {
					cur[x] = ra
					out[y*d.width+x] = int16(ra)
					x++
				}
				if x >= d.width {
					continue // run reached end of line: no interruption sample
				}
				px := d.decodeRunInterruptionPixel(ra, prev[x])
				cur[x] = px
				out[y*d.width+x] = int16(px)
				if d.runIndex > 0 {
					d.runIndex--
				}
				x++
				continue
			}

			// ── Regular mode (T.87 A.10–A.13) ────────────────────────────────
			sign := bitWiseSign(qs)
			qi := abs(qs)
			predicted := predict(ra, rb, rc)
			cp := d.correctPrediction(predicted + applySign(d.c[qi], sign))
			k := computeK(d.n[qi], d.a[qi])
			ev := unmapError(d.decodeMappedError(k, d.limit))
			if k == 0 {
				ev ^= bitWiseSign(2*d.b[qi] + d.n[qi] - 1)
			}
			d.updateRegular(qi, ev)
			ev = applySign(ev, sign)
			recon := (cp + ev) & d.maxval

			cur[x] = recon
			out[y*d.width+x] = int16(recon)
			x++
		}

		copy(prev, cur)
		raStartPrev = raStart
	}
	return out, nil
}

// quantize maps a gradient to a context label in [-4, 4] (T.87 A.3.3).
func (d *jlsDec) quantize(v int) int {
	switch {
	case v <= -d.t3:
		return -4
	case v <= -d.t2:
		return -3
	case v <= -d.t1:
		return -2
	case v < -d.near:
		return -1
	case v <= d.near:
		return 0
	case v < d.t1:
		return 1
	case v < d.t2:
		return 2
	case v < d.t3:
		return 3
	default:
		return 4
	}
}

// predict applies the LOCO-I (MED) fixed predictor (T.87 A.4.2).
func predict(ra, rb, rc int) int {
	if rc >= max2(ra, rb) {
		return min2(ra, rb)
	}
	if rc <= min2(ra, rb) {
		return max2(ra, rb)
	}
	return ra + rb - rc
}

// correctPrediction clamps a bias-corrected prediction into [0, MAXVAL].
func (d *jlsDec) correctPrediction(predicted int) int {
	if predicted&d.maxval == predicted {
		return predicted
	}
	if predicted < 0 {
		return 0
	}
	return d.maxval
}

// computeK selects the Golomb parameter: smallest k with (n<<k) >= a (T.87 A.10).
func computeK(n, a int) int {
	k := 0
	for (n << k) < a {
		k++
	}
	return k
}

// decodeMappedError reads one limited-length Golomb code (T.87 A.5.3 / F.1.9).
func (d *jlsDec) decodeMappedError(k, limit int) int {
	unary := d.br.readUnary()
	if unary < limit-d.qbpp-1 {
		if k == 0 {
			return unary
		}
		return (unary << k) + d.br.readBits(k)
	}
	return d.br.readBits(d.qbpp) + 1
}

// updateRegular updates A, B, C, N for a regular context (T.87 A.12 / A.13).
func (d *jlsDec) updateRegular(q, errval int) {
	d.a[q] += abs(errval)
	d.b[q] += errval
	if d.n[q] == d.reset {
		d.a[q] >>= 1
		d.b[q] >>= 1
		d.n[q] >>= 1
	}
	d.n[q]++

	if d.b[q]+d.n[q] <= 0 {
		d.b[q] += d.n[q]
		if d.b[q] <= -d.n[q] {
			d.b[q] = -d.n[q] + 1
		}
		if d.c[q] > -128 {
			d.c[q]--
		}
	} else if d.b[q] > 0 {
		d.b[q] -= d.n[q]
		if d.b[q] > 0 {
			d.b[q] = 0
		}
		if d.c[q] < 127 {
			d.c[q]++
		}
	}
}

// ── Run mode (T.87 A.7) ───────────────────────────────────────────────────────

// decodeRunPixels decodes the length of a run of pixels equal to Ra. maxRun is
// the number of pixels remaining on the line.
func (d *jlsDec) decodeRunPixels(maxRun int) int {
	index := 0
	for d.br.readBit() == 1 {
		count := 1 << runIndexJ[d.runIndex]
		if count > maxRun-index {
			count = maxRun - index
		}
		index += count
		if count == 1<<runIndexJ[d.runIndex] && d.runIndex < 31 {
			d.runIndex++
		}
		if index == maxRun {
			break
		}
	}
	if index != maxRun {
		if j := runIndexJ[d.runIndex]; j > 0 {
			index += d.br.readBits(j)
		}
	}
	if index > maxRun {
		index = maxRun
	}
	return index
}

// decodeRunInterruptionPixel decodes the sample that terminates a run (T.87 A.7.2).
func (d *jlsDec) decodeRunInterruptionPixel(ra, rb int) int {
	if abs(ra-rb) <= d.near {
		ev := d.decodeRunInterruptionError(1)
		return (ra + ev) & d.maxval
	}
	ev := d.decodeRunInterruptionError(0)
	s := 1
	if rb-ra < 0 {
		s = -1
	}
	return (rb + ev*s) & d.maxval
}

// decodeRunInterruptionError decodes and unmaps a run-interruption error for
// context ri (RItype 0 or 1), then updates that context (T.87 A.7.2 / A.23).
func (d *jlsDec) decodeRunInterruptionError(ri int) int {
	// Golomb parameter (A.7.2): temp = A + (N>>1)*RItype.
	temp := d.runA[ri] + (d.runN[ri]>>1)*ri
	k := 0
	for nt := d.runN[ri]; nt < temp; nt <<= 1 {
		k++
	}

	eMapped := d.decodeMappedError(k, d.limit-runIndexJ[d.runIndex]-1)
	ev := d.computeRunError(ri, eMapped+ri, k)

	// Update variables (A.23).
	if ev < 0 {
		d.runNn[ri]++
	}
	d.runA[ri] += (eMapped + 1 - ri) >> 1
	if d.runN[ri] == d.reset {
		d.runA[ri] >>= 1
		d.runN[ri] >>= 1
		d.runNn[ri] >>= 1
	}
	d.runN[ri]++
	return ev
}

// computeRunError inverts the run-interruption error mapping (T.87 A.21).
func (d *jlsDec) computeRunError(ri, temp, k int) int {
	mapFlag := temp & 1
	absV := (temp + mapFlag) / 2
	cond := 0
	if k != 0 || 2*d.runNn[ri] >= d.runN[ri] {
		cond = 1
	}
	if cond == mapFlag {
		return -absV
	}
	return absV
}

// ── small helpers ─────────────────────────────────────────────────────────────

// unmapError inverts the A.5.2 signed→unsigned mapping (zig-zag).
func unmapError(mapped int) int {
	sign := -(mapped & 1) // 0 if even, -1 if odd
	return sign ^ (mapped >> 1)
}

// bitWiseSign returns -1 when i < 0, else 0.
func bitWiseSign(i int) int {
	if i < 0 {
		return -1
	}
	return 0
}

// applySign returns i when sign==0 and -i when sign==-1 (branch-free in the spec).
func applySign(i, sign int) int { return (sign ^ i) - sign }

func ceilLog2(n int) int {
	k := 0
	for (1 << k) < n {
		k++
	}
	return k
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func max2(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min2(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

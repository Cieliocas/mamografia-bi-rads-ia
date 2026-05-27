package usecase

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// GeneratePDF builds a laudo (radiologist report) PDF for a given study.
type GeneratePDF struct {
	studyRepo  outbound.StudyRepository
	annotRepo  outbound.AnnotationRepository
	patientRepo outbound.PatientRepository
}

func NewGeneratePDF(
	studyRepo outbound.StudyRepository,
	annotRepo outbound.AnnotationRepository,
	patientRepo outbound.PatientRepository,
) *GeneratePDF {
	return &GeneratePDF{
		studyRepo:   studyRepo,
		annotRepo:   annotRepo,
		patientRepo: patientRepo,
	}
}

// Execute returns the PDF bytes for the given study ID.
func (uc *GeneratePDF) Execute(ctx context.Context, studyID string) ([]byte, error) {
	if studyID == "" {
		return nil, fmt.Errorf("study_id is required")
	}

	study, err := uc.studyRepo.FindByID(ctx, studyID)
	if err != nil || study == nil {
		return nil, fmt.Errorf("study not found: %w", err)
	}

	// Load patient.
	var patient *entity.Patient
	if study.PatientUUID != "" {
		patient, _ = uc.patientRepo.FindByID(ctx, study.PatientUUID)
	}

	// Load annotations.
	anns, err := uc.annotRepo.LoadByStudyID(ctx, studyID)
	if err != nil {
		anns = nil // non-fatal; proceed without annotations
	}

	return buildPDF(study, patient, anns)
}

// ─── PDF construction ─────────────────────────────────────────────────────────

// palette
const (
	colorGray0 = 245.0 // almost-white background
	colorGray1 = 180.0 // border / header bg
	colorText  = 30.0  // near-black text
)

func buildPDF(study *entity.Study, patient *entity.Patient, anns []*entity.Annotation) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(20, 22, 20)
	pdf.SetAutoPageBreak(true, 18)
	pdf.AddPage()

	// ── Header bar ───────────────────────────────────────────────────────────
	drawHeader(pdf)

	// ── Patient section ──────────────────────────────────────────────────────
	drawSection(pdf, "Dados do Paciente")
	col2(pdf,
		"Nome:", patientName(patient),
		"ID externo:", safeStr(study.PatientID),
	)
	col2(pdf,
		"Data de nascimento:", patientDOB(patient),
		"Sexo:", patientSex(patient),
	)

	pdf.Ln(3)

	// ── Study info ───────────────────────────────────────────────────────────
	drawSection(pdf, "Informações do Estudo")
	col2(pdf,
		"Data do exame:", fmtDate(study.StudyDate),
		"Modalidade:", "Mamografia (MG)",
	)
	col2(pdf,
		"Arquivo:", shortPath(study.FilePath),
		"N.º de achados:", fmt.Sprintf("%d", len(anns)),
	)

	pdf.Ln(3)

	// ── BI-RADS global badge ─────────────────────────────────────────────────
	drawBiradsBadge(pdf, study.BiradsGlobal)

	pdf.Ln(3)

	// ── Findings table ───────────────────────────────────────────────────────
	if len(anns) > 0 {
		drawSection(pdf, "Achados / Anotações")
		drawAnnotationsTable(pdf, anns)
		pdf.Ln(3)
	}

	// ── Conclusion ───────────────────────────────────────────────────────────
	drawSection(pdf, "Conclusão")
	drawTextBlock(pdf, study.Conclusion)
	pdf.Ln(3)

	// ── Recommendation ───────────────────────────────────────────────────────
	drawSection(pdf, "Recomendação")
	drawTextBlock(pdf, study.Recommendation)
	pdf.Ln(6)

	// ── Signature ────────────────────────────────────────────────────────────
	if study.SignedBy != "" {
		drawSignature(pdf, study.SignedBy, study.SignedAt)
	}

	// ── Footer ───────────────────────────────────────────────────────────────
	drawFooter(pdf)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("fpdf output: %w", err)
	}
	return buf.Bytes(), nil
}

// ─── Section helpers ──────────────────────────────────────────────────────────

func drawHeader(pdf *fpdf.Fpdf) {
	// Background bar
	pdf.SetFillColor(30, 30, 40)
	pdf.Rect(15, 10, 180, 18, "F")

	// Title
	pdf.SetFont("Helvetica", "B", 14)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetXY(20, 13)
	pdf.CellFormat(170, 7, "LAUDO DE MAMOGRAFIA", "", 0, "C", false, 0, "")

	// Sub-title
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetXY(20, 20)
	pdf.CellFormat(170, 4, "Gerado pelo sistema AIdentify — Mamografia BI-RADS IA", "", 0, "C", false, 0, "")

	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(12)
}

func drawSection(pdf *fpdf.Fpdf, title string) {
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetFillColor(colorGray1, colorGray1, colorGray1)
	pdf.SetTextColor(30, 30, 40)
	pdf.CellFormat(170, 6, "  "+strings.ToUpper(title), "LB", 1, "L", true, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.SetFont("Helvetica", "", 9)
	pdf.Ln(1)
}

// col2 prints two label+value pairs side by side.
func col2(pdf *fpdf.Fpdf, lbl1, val1, lbl2, val2 string) {
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(28, 5, lbl1, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(57, 5, val1, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(28, 5, lbl2, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(57, 5, val2, "", 1, "L", false, 0, "")
}

func drawTextBlock(pdf *fpdf.Fpdf, text string) {
	pdf.SetFont("Helvetica", "", 9)
	if text == "" {
		pdf.SetFont("Helvetica", "I", 9)
		pdf.SetTextColor(160, 160, 160)
		pdf.MultiCell(170, 5, "Não preenchido.", "", "L", false)
		pdf.SetTextColor(colorText, colorText, colorText)
		return
	}
	pdf.MultiCell(170, 5, text, "", "L", false)
}

func drawBiradsBadge(pdf *fpdf.Fpdf, birads string) {
	if birads == "" {
		return
	}
	r, g, b := biradsRGB(birads)
	pdf.SetFillColor(r, g, b)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 18)
	pdf.CellFormat(170, 12, "BI-RADS  "+birads, "", 1, "C", true, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(1)

	// Descriptive label
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(90, 90, 90)
	pdf.CellFormat(170, 5, biradsLabel(birads), "", 1, "C", false, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
}

func drawAnnotationsTable(pdf *fpdf.Fpdf, anns []*entity.Annotation) {
	// Header row
	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetFillColor(colorGray0, colorGray0, colorGray0)
	pdf.CellFormat(8, 6, "#", "1", 0, "C", true, 0, "")
	pdf.CellFormat(24, 6, "Tipo", "1", 0, "C", true, 0, "")
	pdf.CellFormat(40, 6, "Coordenadas (px)", "1", 0, "C", true, 0, "")
	pdf.CellFormat(98, 6, "Nota de voz / transcrição", "1", 1, "C", true, 0, "")

	pdf.SetFont("Helvetica", "", 8)
	for i, ann := range anns {
		fill := i%2 == 0
		if fill {
			pdf.SetFillColor(colorGray0, colorGray0, colorGray0)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}

		num := fmt.Sprintf("%d", i+1)
		kind := kindLabel(ann.Kind)
		coords := annCoords(ann)
		note := ann.AudioTranscript
		if note == "" && ann.AudioPath != "" {
			note = "[áudio sem transcrição]"
		}

		// Measure note height
		lineHt := 5.0
		lines := pdf.SplitLines([]byte(note), 96)
		rows := len(lines)
		if rows < 1 {
			rows = 1
		}
		ht := lineHt * float64(rows)

		pdf.CellFormat(8, ht, num, "1", 0, "C", fill, 0, "")
		pdf.CellFormat(24, ht, kind, "1", 0, "C", fill, 0, "")
		pdf.CellFormat(40, ht, coords, "1", 0, "C", fill, 0, "")
		// MultiCell moves the cursor; use SetX afterwards to continue
		x := pdf.GetX()
		y := pdf.GetY()
		pdf.MultiCell(98, lineHt, note, "1", "L", fill)
		_ = x
		_ = y
	}
}

func drawSignature(pdf *fpdf.Fpdf, name, signedAt string) {
	pdf.SetDrawColor(160, 160, 160)
	pdf.Line(20, pdf.GetY(), 95, pdf.GetY())
	pdf.Ln(1)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(75, 5, name, "", 0, "C", false, 0, "")
	pdf.Ln(4)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(100, 100, 100)
	pdf.CellFormat(75, 5, "Assinado em: "+fmtDateStr(signedAt), "", 0, "C", false, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(6)
}

func drawFooter(pdf *fpdf.Fpdf) {
	pdf.SetY(-15)
	pdf.SetFont("Helvetica", "I", 7)
	pdf.SetTextColor(160, 160, 160)
	pdf.CellFormat(85, 5, fmt.Sprintf("Emitido em %s", time.Now().Format("02/01/2006 15:04")), "", 0, "L", false, 0, "")
	pdf.CellFormat(85, 5, "AIdentify — Mamografia BI-RADS IA", "", 0, "R", false, 0, "")
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

func patientName(p *entity.Patient) string {
	if p == nil || p.Name == "" {
		return "—"
	}
	return p.Name
}

func patientDOB(p *entity.Patient) string {
	if p == nil || p.BirthDate == "" {
		return "—"
	}
	return p.BirthDate
}

func patientSex(p *entity.Patient) string {
	if p == nil {
		return "—"
	}
	switch p.Sex {
	case "F":
		return "Feminino"
	case "M":
		return "Masculino"
	case "O":
		return "Outro"
	default:
		return "—"
	}
}

func safeStr(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

func shortPath(path string) string {
	if len(path) > 50 {
		return "…" + path[len(path)-47:]
	}
	return path
}

func fmtDate(t time.Time) string {
	if t.IsZero() {
		return "—"
	}
	return t.Format("02/01/2006")
}

func fmtDateStr(s string) string {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return s
	}
	return t.Format("02/01/2006 15:04")
}

func kindLabel(k entity.AnnotationKind) string {
	switch k {
	case entity.AnnotationBoundingBox:
		return "Região (ROI)"
	case entity.AnnotationPolygon:
		return "Polígono"
	case entity.AnnotationPoint:
		return "Ponto"
	default:
		return string(k)
	}
}

func annCoords(ann *entity.Annotation) string {
	switch ann.Kind {
	case entity.AnnotationBoundingBox:
		if ann.BBox != nil {
			return fmt.Sprintf("x=%.0f y=%.0f w=%.0f h=%.0f",
				ann.BBox.X, ann.BBox.Y, ann.BBox.Width, ann.BBox.Height)
		}
	case entity.AnnotationPoint:
		if ann.Point != nil {
			return fmt.Sprintf("x=%.0f y=%.0f", ann.Point.X, ann.Point.Y)
		}
	case entity.AnnotationPolygon:
		if ann.Polygon != nil {
			return fmt.Sprintf("%d pontos", len(ann.Polygon.Points))
		}
	}
	return "—"
}

func biradsRGB(birads string) (r, g, b int) {
	switch strings.ToUpper(strings.TrimSpace(birads)) {
	case "0":
		return 100, 100, 100
	case "1":
		return 34, 139, 34 // forest green
	case "2":
		return 50, 168, 82 // green
	case "3":
		return 230, 160, 0 // amber
	case "4A", "4B", "4C", "4":
		return 210, 80, 20 // orange-red
	case "5":
		return 180, 20, 20 // red
	case "6":
		return 100, 0, 0 // dark red
	default:
		return 60, 60, 60
	}
}

func biradsLabel(birads string) string {
	labels := map[string]string{
		"0":  "Avaliação incompleta — exames adicionais necessários",
		"1":  "Negativo — achados benignos, rastreamento habitual",
		"2":  "Achado benigno — sem indicação de malignidade",
		"3":  "Provavelmente benigno — controle em 6 meses",
		"4":  "Suspeito — biópsia recomendada",
		"4A": "Suspeito (baixa) — biópsia recomendada",
		"4B": "Suspeito (intermediário) — biópsia recomendada",
		"4C": "Suspeito (moderado) — biópsia recomendada",
		"5":  "Altamente sugestivo de malignidade — biópsia recomendada",
		"6":  "Malignidade conhecida — tratamento em curso",
	}
	if lbl, ok := labels[strings.ToUpper(strings.TrimSpace(birads))]; ok {
		return lbl
	}
	return ""
}

package usecase

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/png"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/imaging"
	"mammo/apps/core/internal/ports/outbound"
)

// GeneratePDF builds a laudo (radiologist report) PDF for a given study.
type GeneratePDF struct {
	studyRepo   outbound.StudyRepository
	annotRepo   outbound.AnnotationRepository
	patientRepo outbound.PatientRepository
	reader      outbound.FilesystemReader
}

func NewGeneratePDF(
	studyRepo outbound.StudyRepository,
	annotRepo outbound.AnnotationRepository,
	patientRepo outbound.PatientRepository,
	reader outbound.FilesystemReader,
) *GeneratePDF {
	return &GeneratePDF{
		studyRepo:   studyRepo,
		annotRepo:   annotRepo,
		patientRepo: patientRepo,
		reader:      reader,
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

	// Render annotated preview image (best-effort — PDF is still generated on failure).
	pngBytes := uc.renderAnnotatedPNG(study.FilePath, anns)

	return buildPDF(study, patient, anns, pngBytes)
}

// renderAnnotatedPNG renders the DICOM file with annotation overlays as PNG
// bytes. Returns nil if the file is missing, unreadable, or a plain raster
// image (those are passed through without DICOM decoding).
func (uc *GeneratePDF) renderAnnotatedPNG(filePath string, anns []*entity.Annotation) []byte {
	if filePath == "" || uc.reader == nil {
		return nil
	}
	// Skip raster images — no pixel-level DICOM decoding needed.
	lower := strings.ToLower(filePath)
	if strings.HasSuffix(lower, ".png") || strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") {
		return nil
	}

	pixels, meta, err := uc.reader.ReadDICOM(filePath)
	if err != nil || pixels == nil {
		return nil
	}

	// Use VOI LUT when available, otherwise fall back to WW/WC windowing.
	var gray *image.Gray
	if meta != nil && len(meta.VOILUTData) > 0 {
		gray = imaging.RenderVOILUT(pixels, meta.VOILUTData, meta.VOILUTFirstEntry)
	} else {
		wc, ww := 2048.0, 4096.0
		if meta != nil {
			if meta.WindowCenter != 0 {
				wc = meta.WindowCenter
			}
			if meta.WindowWidth != 0 {
				ww = meta.WindowWidth
			}
		}
		gray = imaging.RenderGrayscale(pixels, wc, ww)
	}
	rgba := imaging.ToRGBA(gray)
	imaging.DrawAnnotations(rgba, anns)

	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return nil
	}
	return buf.Bytes()
}

// ─── PDF construction ─────────────────────────────────────────────────────────

// palette
const (
	colorGray0 = 245.0 // almost-white background
	colorGray1 = 180.0 // border / header bg
	colorText  = 30.0  // near-black text
)

func buildPDF(study *entity.Study, patient *entity.Patient, anns []*entity.Annotation, pngBytes []byte) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	// As fontes principais do gofpdf são CP1252; as cadeias do código são UTF-8.
	// Sem tradutor, "mamária" sai como "mamÃ¡ria" e travessões viram lixo.
	// tr precisa envolver TODO texto que chega ao PDF.
	tr = pdf.UnicodeTranslatorFromDescriptor("cp1252")
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
	drawDensityLine(pdf, study.BiradsDensity)

	pdf.Ln(3)

	// ── Annotated image ───────────────────────────────────────────────────────
	if len(pngBytes) > 0 {
		drawImageSection(pdf, pngBytes)
	}

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

// tr converte UTF-8 para a codificação da fonte. Definido em GeneratePDF, antes
// de qualquer escrita. Identidade até lá, para nunca produzir pânico.
var tr = func(s string) string { return s }

func drawHeader(pdf *fpdf.Fpdf) {
	// Background bar
	pdf.SetFillColor(30, 30, 40)
	pdf.Rect(15, 10, 180, 18, "F")

	// Title
	pdf.SetFont("Helvetica", "B", 14)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetXY(20, 13)
	pdf.CellFormat(170, 7, tr("LAUDO DE MAMOGRAFIA"), "", 0, "C", false, 0, "")

	// Sub-title
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetXY(20, 20)
	pdf.CellFormat(170, 4, tr("Gerado pelo sistema AIdentify — Mamografia BI-RADS IA"), "", 0, "C", false, 0, "")

	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(12)
}

func drawSection(pdf *fpdf.Fpdf, title string) {
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetFillColor(colorGray1, colorGray1, colorGray1)
	pdf.SetTextColor(30, 30, 40)
	pdf.CellFormat(170, 6, tr("  "+strings.ToUpper(title)), "LB", 1, "L", true, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.SetFont("Helvetica", "", 9)
	pdf.Ln(1)
}

// col2 prints two label+value pairs side by side.
func col2(pdf *fpdf.Fpdf, lbl1, val1, lbl2, val2 string) {
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(28, 5, tr(lbl1), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(57, 5, tr(val1), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(28, 5, tr(lbl2), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(57, 5, tr(val2), "", 1, "L", false, 0, "")
}

func drawTextBlock(pdf *fpdf.Fpdf, text string) {
	pdf.SetFont("Helvetica", "", 9)
	if text == "" {
		pdf.SetFont("Helvetica", "I", 9)
		pdf.SetTextColor(160, 160, 160)
		pdf.MultiCell(170, 5, tr("Não preenchido."), "", "L", false)
		pdf.SetTextColor(colorText, colorText, colorText)
		return
	}
	pdf.MultiCell(170, 5, tr(text), "", "L", false)
}

func drawBiradsBadge(pdf *fpdf.Fpdf, birads string) {
	if birads == "" {
		return
	}
	r, g, b := biradsRGB(birads)
	pdf.SetFillColor(r, g, b)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 18)
	pdf.CellFormat(170, 12, tr("BI-RADS  "+birads), "", 1, "C", true, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(1)

	// Descriptive label
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(90, 90, 90)
	pdf.CellFormat(170, 5, tr(biradsLabel(birads)), "", 1, "C", false, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
}

// drawDensityLine prints the ACR breast density (composition) below the
// BI-RADS badge, e.g. "Densidade mamária: C — Heterogeneamente densas".
func drawDensityLine(pdf *fpdf.Fpdf, density string) {
	if density == "" {
		return
	}
	pdf.Ln(1)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(170, 5, tr("Densidade mamária: "+density+" — "+densityLabel(density)), "", 1, "C", false, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
}

// densityLabel returns the BI-RADS 5th-edition description for an ACR grade.
func densityLabel(d string) string {
	switch d {
	case "A":
		return "Mamas quase inteiramente adiposas"
	case "B":
		return "Densidades fibroglandulares dispersas"
	case "C":
		return "Tecido mamário heterogeneamente denso"
	case "D":
		return "Mamas extremamente densas"
	default:
		return ""
	}
}

// drawImageSection embeds the annotated PNG into the PDF, centred and scaled
// to fit within the printable width (170 mm) with a maximum height of 130 mm.
func drawImageSection(pdf *fpdf.Fpdf, pngBytes []byte) {
	drawSection(pdf, "Imagem Anotada")

	r := bytes.NewReader(pngBytes)
	imgName := "annotated_preview.png"
	info := pdf.RegisterImageOptionsReader(imgName, fpdf.ImageOptions{ImageType: "PNG"}, r)
	if info == nil {
		pdf.SetFont("Helvetica", "I", 8)
		pdf.SetTextColor(160, 160, 160)
		pdf.MultiCell(170, 5, tr("[Imagem não disponível]"), "", "C", false)
		pdf.SetTextColor(colorText, colorText, colorText)
		pdf.Ln(3)
		return
	}

	const maxW, maxH = 150.0, 130.0
	iw := float64(info.Width())
	ih := float64(info.Height())

	w := maxW
	h := w * ih / iw
	if h > maxH {
		h = maxH
		w = h * iw / ih
	}

	// Centre horizontally within the 170 mm content area (left margin = 20 mm).
	x := 20.0 + (170.0-w)/2.0
	y := pdf.GetY()

	pdf.ImageOptions(imgName, x, y, w, h, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	pdf.Ln(h + 4)
}

func drawAnnotationsTable(pdf *fpdf.Fpdf, anns []*entity.Annotation) {
	// Colunas escolhidas pelo que o radiologista precisa reler depois: o que ele
	// escreveu. A versão anterior mostrava só a transcrição de voz, de modo que
	// rótulo, BI-RADS e notas clínicas — digitados no painel direito — nunca
	// chegavam ao laudo.
	const (
		wNum    = 8.0
		wTipo   = 20.0
		wCoord  = 34.0
		wAchado = 40.0
		wNotas  = 68.0
	)

	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetFillColor(colorGray0, colorGray0, colorGray0)
	pdf.CellFormat(wNum, 6, tr("#"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(wTipo, 6, tr("Tipo"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(wCoord, 6, tr("Coordenadas (px)"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(wAchado, 6, tr("Achado"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(wNotas, 6, tr("Notas clínicas"), "1", 1, "C", true, 0, "")

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
		achado := strings.TrimSpace(ann.Label)
		if achado == "" {
			achado = "—"
		}

		// As notas do achado e a transcrição da nota de voz são coisas distintas;
		// ambas pertencem ao laudo, identificadas.
		notas := strings.TrimSpace(ann.Notes)
		if t := strings.TrimSpace(ann.AudioTranscript); t != "" {
			if notas != "" {
				notas += "\n"
			}
			notas += "Voz: " + t
		} else if ann.AudioPath != "" {
			if notas != "" {
				notas += "\n"
			}
			notas += "[áudio sem transcrição]"
		}
		if notas == "" {
			notas = "—"
		}

		// A altura da linha acompanha a coluna mais alta entre achado e notas.
		lineHt := 4.5
		rows := len(pdf.SplitLines([]byte(tr(notas)), wNotas-2))
		if r := len(pdf.SplitLines([]byte(tr(achado)), wAchado-2)); r > rows {
			rows = r
		}
		if rows < 1 {
			rows = 1
		}
		ht := lineHt * float64(rows)

		// Quebra de página antes de uma linha que não caberia inteira.
		if pdf.GetY()+ht > 275 {
			pdf.AddPage()
		}

		x, y := pdf.GetX(), pdf.GetY()
		pdf.CellFormat(wNum, ht, tr(num), "1", 0, "C", fill, 0, "")
		pdf.CellFormat(wTipo, ht, tr(kind), "1", 0, "C", fill, 0, "")
		pdf.CellFormat(wCoord, ht, tr(coords), "1", 0, "C", fill, 0, "")

		// MultiCell move o cursor para a linha seguinte; reposiciona-se à mão
		// para manter as duas últimas colunas na mesma linha da tabela.
		pdf.SetXY(x+wNum+wTipo+wCoord, y)
		pdf.MultiCell(wAchado, lineHt, tr(achado), "1", "L", fill)
		pdf.SetXY(x+wNum+wTipo+wCoord+wAchado, y)
		pdf.MultiCell(wNotas, lineHt, tr(notas), "1", "L", fill)
		pdf.SetXY(x, y+ht)
	}
	pdf.Ln(2)
}

func drawSignature(pdf *fpdf.Fpdf, name, signedAt string) {
	pdf.SetDrawColor(160, 160, 160)
	pdf.Line(20, pdf.GetY(), 95, pdf.GetY())
	pdf.Ln(1)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(75, 5, tr(name), "", 0, "C", false, 0, "")
	pdf.Ln(4)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(100, 100, 100)
	pdf.CellFormat(75, 5, tr("Assinado em: "+fmtDateStr(signedAt)), "", 0, "C", false, 0, "")
	pdf.SetTextColor(colorText, colorText, colorText)
	pdf.Ln(6)
}

func drawFooter(pdf *fpdf.Fpdf) {
	pdf.SetY(-15)
	pdf.SetFont("Helvetica", "I", 7)
	pdf.SetTextColor(160, 160, 160)
	pdf.CellFormat(85, 5, tr(fmt.Sprintf("Emitido em %s", time.Now().Format("02/01/2006 15:04"))), "", 0, "L", false, 0, "")
	pdf.CellFormat(85, 5, tr("AIdentify — Mamografia BI-RADS IA"), "", 0, "R", false, 0, "")
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

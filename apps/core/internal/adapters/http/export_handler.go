package http

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/ports/outbound"
)

// ExportHandler handles /api/export routes.
type ExportHandler struct {
	export    *usecase.ExportDataset
	studyRepo outbound.StudyRepository
	annotRepo outbound.AnnotationRepository
}

func NewExportHandler(
	uc *usecase.ExportDataset,
	studyRepo outbound.StudyRepository,
	annotRepo outbound.AnnotationRepository,
) *ExportHandler {
	return &ExportHandler{export: uc, studyRepo: studyRepo, annotRepo: annotRepo}
}

func (h *ExportHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.GET("/export", h.exportDataset)
	api.GET("/export/report/:id", h.reportHTML)
}

// GET /api/export?format=json|csv[&study_ids=id1,id2]
func (h *ExportHandler) exportDataset(c *gin.Context) {
	format := usecase.ExportFormat(c.DefaultQuery("format", "json"))
	rawIDs := c.Query("study_ids")

	var ids []string
	if rawIDs != "" {
		for _, id := range strings.Split(rawIDs, ",") {
			if id = strings.TrimSpace(id); id != "" {
				ids = append(ids, id)
			}
		}
	}

	var buf bytes.Buffer
	mime, err := h.export.Execute(context.Background(), usecase.ExportDatasetInput{
		StudyIDs: ids,
		Format:   format,
	}, &buf)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("mammo-export-%s.%s",
		time.Now().Format("2006-01-02"), string(format))
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, mime, buf.Bytes())
}

// GET /api/export/report/:id — HTML printable report (use browser Print → PDF).
func (h *ExportHandler) reportHTML(c *gin.Context) {
	studyID := c.Param("id")

	study, err := h.studyRepo.FindByID(context.Background(), studyID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}

	anns, err := h.annotRepo.LoadByStudyID(context.Background(), studyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type annRow struct {
		ID   string
		Kind string
		X, Y, W, H float64
	}
	rows := make([]annRow, 0, len(anns))
	for _, a := range anns {
		r := annRow{ID: string(a.ID), Kind: string(a.Kind)}
		if a.BBox != nil {
			r.X, r.Y, r.W, r.H = a.BBox.X, a.BBox.Y, a.BBox.Width, a.BBox.Height
		}
		rows = append(rows, r)
	}

	data := struct {
		StudyID   string
		PatientID string
		StudyDate string
		Generated string
		Rows      []annRow
	}{
		StudyID:   studyID,
		PatientID: study.PatientID,
		StudyDate: study.StudyDate.Format("02/01/2006"),
		Generated: time.Now().Format("02/01/2006 15:04"),
		Rows:      rows,
	}

	var buf bytes.Buffer
	if err := reportTpl.Execute(&buf, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html; charset=utf-8", buf.Bytes())
}

// reportTpl is the printable HTML report template.
var reportTpl = template.Must(template.New("report").Funcs(template.FuncMap{
	"add": func(a, b int) int { return a + b },
}).Parse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório de Mamografia — {{ .StudyID }}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 40px 48px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 700; color: #7c3aed; letter-spacing: -0.5px; }
  .logo span { color: #06b6d4; }
  .meta { text-align: right; font-size: 11px; color: #6b7280; }
  h2 { font-size: 15px; font-weight: 700; color: #374151; margin-bottom: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 28px; }
  .info-card { background: #f5f3ff; border-left: 3px solid #7c3aed; border-radius: 4px; padding: 10px 14px; }
  .info-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 4px; }
  .info-card .value { font-weight: 600; color: #1a1a2e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  thead tr { background: #7c3aed; color: #fff; }
  thead th { padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  .empty { text-align: center; color: #9ca3af; padding: 24px; font-style: italic; }
  footer { border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 20px 28px; }
    @page { margin: 1.5cm; }
    header { page-break-after: avoid; }
  }
</style>
</head>
<body>
<header>
  <div class="logo">AI<span>dentify</span> <span style="font-size:11px;font-weight:400;color:#6b7280">Radiology Precision AI</span></div>
  <div class="meta">
    <div>Relatório Clínico de Mamografia</div>
    <div>Gerado em: {{ .Generated }}</div>
  </div>
</header>

<div class="info-grid">
  <div class="info-card">
    <div class="label">Study ID</div>
    <div class="value" style="font-size:10px;word-break:break-all">{{ .StudyID }}</div>
  </div>
  <div class="info-card">
    <div class="label">Paciente</div>
    <div class="value">{{ if .PatientID }}{{ .PatientID }}{{ else }}—{{ end }}</div>
  </div>
  <div class="info-card">
    <div class="label">Data do Estudo</div>
    <div class="value">{{ if .StudyDate }}{{ .StudyDate }}{{ else }}—{{ end }}</div>
  </div>
</div>

<h2>Anotações / ROIs</h2>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Annotation ID</th>
      <th>Tipo</th>
      <th>X</th>
      <th>Y</th>
      <th>Largura</th>
      <th>Altura</th>
    </tr>
  </thead>
  <tbody>
    {{ if .Rows }}
      {{ range $i, $r := .Rows }}
      <tr>
        <td>{{ add $i 1 }}</td>
        <td style="font-size:10px">{{ $r.ID }}</td>
        <td>{{ $r.Kind }}</td>
        <td>{{ printf "%.1f" $r.X }}</td>
        <td>{{ printf "%.1f" $r.Y }}</td>
        <td>{{ printf "%.1f" $r.W }}</td>
        <td>{{ printf "%.1f" $r.H }}</td>
      </tr>
      {{ end }}
    {{ else }}
      <tr><td colspan="7" class="empty">Nenhuma anotação registrada para este estudo.</td></tr>
    {{ end }}
  </tbody>
</table>

<footer>
  <span>AIdentify — Radiology Precision AI &copy; 2026</span>
  <span>Este relatório é gerado automaticamente e não substitui avaliação clínica.</span>
</footer>

<script>
  // Auto-print when opened as report window.
  if (window.opener || window.name === 'mammo-report') {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
</script>
</body>
</html>
`))


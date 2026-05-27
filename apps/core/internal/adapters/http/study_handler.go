package http

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/ports/outbound"
)

// StudyHandler handles /api/studies routes.
type StudyHandler struct {
	openStudy       *usecase.OpenStudy
	annotationsSaver  *usecase.SaveAnnotations
	annotationsLoader *usecase.LoadAnnotations
	studyRepo       outbound.StudyRepository
}

func NewStudyHandler(
	open *usecase.OpenStudy,
	save *usecase.SaveAnnotations,
	load *usecase.LoadAnnotations,
	repo outbound.StudyRepository,
) *StudyHandler {
	return &StudyHandler{
		openStudy:         open,
		annotationsSaver:  save,
		annotationsLoader: load,
		studyRepo:         repo,
	}
}

// RegisterRoutes wires study endpoints onto the given router group.
func (h *StudyHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.POST("/studies", h.createStudy)
	api.GET("/studies", h.listStudies)
	api.GET("/studies/:id", h.getStudy)
	api.PATCH("/studies/:id/clinical", h.patchClinical)
	api.POST("/studies/:id/annotations", h.saveAnnotations)
	api.GET("/studies/:id/annotations", h.getAnnotations)
}

// patchClinical updates the radiologist's report fields on a study.
type clinicalReq struct {
	BiradsGlobal   *string `json:"birads_global,omitempty"`
	Conclusion     *string `json:"conclusion,omitempty"`
	Recommendation *string `json:"recommendation,omitempty"`
	SignedBy       *string `json:"signed_by,omitempty"`
	SignedAt       *string `json:"signed_at,omitempty"`
}

func (h *StudyHandler) patchClinical(c *gin.Context) {
	id := c.Param("id")
	study, err := h.studyRepo.FindByID(context.Background(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}
	var req clinicalReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.BiradsGlobal != nil   { study.BiradsGlobal = *req.BiradsGlobal }
	if req.Conclusion != nil     { study.Conclusion = *req.Conclusion }
	if req.Recommendation != nil { study.Recommendation = *req.Recommendation }
	if req.SignedBy != nil       { study.SignedBy = *req.SignedBy }
	if req.SignedAt != nil       { study.SignedAt = *req.SignedAt }

	if err := h.studyRepo.Save(context.Background(), study); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "saved"})
}

func (h *StudyHandler) createStudy(c *gin.Context) {
	var req usecase.OpenStudyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	out, err := h.openStudy.Execute(context.Background(), req)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	resp := gin.H{
		"id":           string(out.Study.ID),
		"patient_id":   out.Study.PatientID,
		"patient_uuid": out.Study.PatientUUID,
		"study_date":   out.Study.StudyDate,
		"width":        out.Width,
		"height":       out.Height,
	}
	if p := out.Patient; p != nil {
		resp["patient"] = gin.H{
			"id":          string(p.ID),
			"external_id": p.ExternalID,
			"name":        p.Name,
			"birth_date":  p.BirthDate,
			"sex":         p.Sex,
		}
	}
	if m := out.Metadata; m != nil {
		// Basic (already existed)
		resp["modality"]       = m.Modality
		resp["description"]    = m.Description
		resp["window_center"]  = m.WindowCenter
		resp["window_width"]   = m.WindowWidth
		resp["bits_stored"]    = m.BitsStored
		resp["frame_count"]    = m.FrameCount
		if m.PixelSpacing > 0 { resp["pixel_spacing"] = m.PixelSpacing }
		if m.Photometric != "" { resp["photometric"] = m.Photometric }

		// ── Full DICOM panel fields ──────────────────────────────────────────
		// Patient
		setIfNonEmpty(resp, "patient_name",       m.PatientName)
		setIfNonEmpty(resp, "patient_birth_date",  m.PatientBirthDate)
		setIfNonEmpty(resp, "patient_sex",         m.PatientSex)
		// Study
		setIfNonEmpty(resp, "study_description",   m.StudyDescription)
		setIfNonEmpty(resp, "accession_number",    m.AccessionNumber)
		setIfNonEmpty(resp, "study_instance_uid",  m.StudyInstanceUID)
		// Series
		setIfNonEmpty(resp, "series_number",       m.SeriesNumber)
		setIfNonEmpty(resp, "laterality",          m.Laterality)
		setIfNonEmpty(resp, "view_position",       m.ViewPosition)
		setIfNonEmpty(resp, "body_part_examined",  m.BodyPartExamined)
		// Equipment
		setIfNonEmpty(resp, "manufacturer",        m.Manufacturer)
		setIfNonEmpty(resp, "manufacturer_model",  m.ManufacturerModel)
		setIfNonEmpty(resp, "institution_name",    m.InstitutionName)
		setIfNonEmpty(resp, "station_name",        m.StationName)
		// Acquisition
		if m.KVP > 0              { resp["kvp"] = m.KVP }
		if m.ExposureTime > 0     { resp["exposure_time_ms"] = m.ExposureTime }
		if m.TubeCurrent > 0      { resp["tube_current_ma"] = m.TubeCurrent }
		if m.Exposure > 0         { resp["exposure_mas"] = m.Exposure }
		if m.CompressionForce > 0 { resp["compression_force_n"] = m.CompressionForce }
		if m.ImagerPixelSpacingRow > 0 { resp["imager_pixel_spacing"] = m.ImagerPixelSpacingRow }
		// Image dims
		if m.BitsAllocated > 0 { resp["bits_allocated"] = m.BitsAllocated }
		if m.Rows > 0          { resp["rows"] = m.Rows }
		if m.Columns > 0       { resp["columns"] = m.Columns }
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *StudyHandler) listStudies(c *gin.Context) {
	studies, err := h.studyRepo.List(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type item struct {
		ID        string `json:"id"`
		PatientID string `json:"patient_id"`
	}
	result := make([]item, 0, len(studies))
	for _, s := range studies {
		result = append(result, item{ID: string(s.ID), PatientID: s.PatientID})
	}
	c.JSON(http.StatusOK, result)
}

func (h *StudyHandler) getStudy(c *gin.Context) {
	s, err := h.studyRepo.FindByID(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":             string(s.ID),
		"patient_id":     s.PatientID,
		"patient_uuid":   s.PatientUUID,
		"study_date":     s.StudyDate,
		"birads_global":  s.BiradsGlobal,
		"conclusion":     s.Conclusion,
		"recommendation": s.Recommendation,
		"signed_by":      s.SignedBy,
		"signed_at":      s.SignedAt,
	})
}

func (h *StudyHandler) saveAnnotations(c *gin.Context) {
	var req usecase.SaveAnnotationsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.StudyID = c.Param("id")
	if err := h.annotationsSaver.Execute(context.Background(), req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "saved"})
}

// setIfNonEmpty adds key→value to the map only when value is not the zero string.
func setIfNonEmpty(m gin.H, key, value string) {
	if value != "" {
		m[key] = value
	}
}

func (h *StudyHandler) getAnnotations(c *gin.Context) {
	out, err := h.annotationsLoader.Execute(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dtos := make([]usecase.AnnotationDTO, 0, len(out.Annotations))
	for _, a := range out.Annotations {
		dtos = append(dtos, usecase.EntityToDTO(a))
	}
	c.JSON(http.StatusOK, gin.H{"annotations": dtos, "count": len(dtos)})
}

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
		"id":         string(out.Study.ID),
		"patient_id": out.Study.PatientID,
		"study_date": out.Study.StudyDate,
		"width":      out.Width,
		"height":     out.Height,
	}
	if m := out.Metadata; m != nil {
		resp["modality"] = m.Modality
		resp["description"] = m.Description
		resp["window_center"] = m.WindowCenter
		resp["window_width"] = m.WindowWidth
		resp["bits_stored"] = m.BitsStored
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

func (h *StudyHandler) getAnnotations(c *gin.Context) {
	out, err := h.annotationsLoader.Execute(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"annotations": out.Annotations, "count": len(out.Annotations)})
}

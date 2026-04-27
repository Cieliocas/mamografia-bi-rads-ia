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
	api.POST("/studies/:id/annotations", h.saveAnnotations)
	api.GET("/studies/:id/annotations", h.getAnnotations)
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
	c.JSON(http.StatusCreated, gin.H{
		"id":         string(out.Study.ID),
		"patient_id": out.Study.PatientID,
		"study_date": out.Study.StudyDate,
	})
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
		"id":         string(s.ID),
		"patient_id": s.PatientID,
		"study_date": s.StudyDate,
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

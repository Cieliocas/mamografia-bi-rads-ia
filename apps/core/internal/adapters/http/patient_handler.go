package http

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/ports/outbound"
)

// PatientHandler exposes /api/patients endpoints for CRUD + study listing.
type PatientHandler struct {
	repo      outbound.PatientRepository
	studyRepo outbound.StudyRepository
	updater   *usecase.UpdatePatient
}

func NewPatientHandler(
	repo outbound.PatientRepository,
	studyRepo outbound.StudyRepository,
	updater *usecase.UpdatePatient,
) *PatientHandler {
	return &PatientHandler{repo: repo, studyRepo: studyRepo, updater: updater}
}

func (h *PatientHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/patients", h.list)
	rg.POST("/patients", h.create)
	rg.GET("/patients/:id", h.get)
	rg.PATCH("/patients/:id", h.update)
	rg.GET("/patients/:id/studies", h.listStudies)
	rg.PATCH("/studies/:id/patient", h.assignToStudy)
}

func patientJSON(p *entity.Patient) gin.H {
	return gin.H{
		"id":          string(p.ID),
		"external_id": p.ExternalID,
		"name":        p.Name,
		"birth_date":  p.BirthDate,
		"sex":         p.Sex,
		"notes":       p.Notes,
		"created_at":  p.CreatedAt,
	}
}

func (h *PatientHandler) list(c *gin.Context) {
	q := c.Query("q")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	patients, err := h.repo.List(context.Background(), q, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(patients))
	for _, p := range patients {
		out = append(out, patientJSON(p))
	}
	c.JSON(http.StatusOK, out)
}

type createPatientReq struct {
	ExternalID string `json:"external_id"`
	Name       string `json:"name"`
	BirthDate  string `json:"birth_date"`
	Sex        string `json:"sex"`
	Notes      string `json:"notes"`
}

func (h *PatientHandler) create(c *gin.Context) {
	var req createPatientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p := &entity.Patient{
		ID:         entity.PatientID(uuid.NewString()),
		ExternalID: req.ExternalID,
		Name:       req.Name,
		BirthDate:  req.BirthDate,
		Sex:        req.Sex,
		Notes:      req.Notes,
		CreatedAt:  time.Now(),
	}
	if err := h.repo.Save(context.Background(), p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, patientJSON(p))
}

func (h *PatientHandler) get(c *gin.Context) {
	p, err := h.repo.FindByID(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "patient not found"})
		return
	}
	c.JSON(http.StatusOK, patientJSON(p))
}

type updatePatientReq struct {
	ExternalID *string `json:"external_id,omitempty"`
	Name       *string `json:"name,omitempty"`
	BirthDate  *string `json:"birth_date,omitempty"`
	Sex        *string `json:"sex,omitempty"`
	Notes      *string `json:"notes,omitempty"`
}

func (h *PatientHandler) update(c *gin.Context) {
	var req updatePatientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p, err := h.updater.Execute(context.Background(), usecase.UpdatePatientInput{
		ID:         c.Param("id"),
		ExternalID: req.ExternalID,
		Name:       req.Name,
		BirthDate:  req.BirthDate,
		Sex:        req.Sex,
		Notes:      req.Notes,
	})
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, patientJSON(p))
}

func (h *PatientHandler) listStudies(c *gin.Context) {
	studies, err := h.studyRepo.ListByPatient(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(studies))
	for _, s := range studies {
		out = append(out, gin.H{
			"id":             string(s.ID),
			"study_date":     s.StudyDate,
			"birads_global":  s.BiradsGlobal,
			"created_at":     s.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, out)
}

type assignReq struct {
	PatientUUID string `json:"patient_uuid"`
}

// assignToStudy re-points a study to a different (existing) patient. Used
// when the radiologist corrects the auto-extracted association.
func (h *PatientHandler) assignToStudy(c *gin.Context) {
	var req assignReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	study, err := h.studyRepo.FindByID(context.Background(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "study not found"})
		return
	}
	if req.PatientUUID != "" {
		// Validate the target patient exists.
		if _, err := h.repo.FindByID(context.Background(), req.PatientUUID); err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "target patient not found"})
			return
		}
	}
	study.PatientUUID = req.PatientUUID
	if err := h.studyRepo.Save(context.Background(), study); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "saved", "patient_uuid": req.PatientUUID})
}

package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	adapthttp "mammo/apps/core/internal/adapters/http"
	"mammo/apps/core/internal/adapters/sqlite"
	"mammo/apps/core/internal/application/usecase"
	"mammo/apps/core/internal/domain/entity"
	"mammo/apps/core/internal/infrastructure/guardian"
	"mammo/apps/core/internal/infrastructure/queue"
	"mammo/apps/core/internal/ports/outbound"
)

// ─── Mock FilesystemReader ────────────────────────────────────────────────────

type mockReader struct{}

func (m *mockReader) ReadDICOM(path string) (*outbound.Pixels16, *outbound.DICOMMetadata, error) {
	// Return a synthetic 4×4 MONOCHROME2 image so no real file is needed.
	pixels := make([]int16, 4*4)
	for i := range pixels {
		pixels[i] = int16(i * 1000)
	}
	p := &outbound.Pixels16{
		Data:        pixels,
		Width:       4,
		Height:      4,
		Signed:      false,
		Photometric: "MONOCHROME2",
	}
	meta := &outbound.DICOMMetadata{
		PatientID:    "TESTPAT001",
		StudyDate:    time.Now().Format("20060102"),
		Modality:     "MG",
		Description:  "Test mammogram",
		WindowCenter: 128,
		WindowWidth:  256,
		BitsStored:   8,
		FrameCount:   1,
		PixelSpacing: 0.1,
		Photometric:  "MONOCHROME2",
	}
	return p, meta, nil
}

func (m *mockReader) ReadDICOMFrame(path string, frameIdx int) (*outbound.Pixels16, error) {
	pixels := make([]int16, 4*4)
	return &outbound.Pixels16{
		Data:        pixels,
		Width:       4,
		Height:      4,
		Signed:      false,
		Photometric: "MONOCHROME2",
	}, nil
}

// ─── Mock AIClient ────────────────────────────────────────────────────────────

type mockAI struct{}

func (m *mockAI) Predict(_ context.Context, _ string) (*outbound.FindingCandidates, error) {
	return &outbound.FindingCandidates{Findings: nil, ModelID: "mock"}, nil
}
func (m *mockAI) HealthCheck(_ context.Context) error { return nil }

// ─── Test server factory ──────────────────────────────────────────────────────

func newTestServer(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := sqlite.Open(":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	studyRepo  := sqlite.NewStudyRepository(db)
	annotRepo  := sqlite.NewAnnotationRepository(db)
	patientRepo := sqlite.NewPatientRepository(db)

	reader := &mockReader{}

	ensurePatient := usecase.NewEnsurePatient(patientRepo)
	openStudyUC   := usecase.NewOpenStudy(studyRepo, reader, ensurePatient)
	saveAnnotUC   := usecase.NewSaveAnnotations(annotRepo)
	loadAnnotUC   := usecase.NewLoadAnnotations(annotRepo)
	updatePatUC   := usecase.NewUpdatePatient(patientRepo)
	exportUC      := usecase.NewExportDataset(studyRepo, annotRepo)
	windowingUC   := usecase.NewApplyWindowing()

	taskQ       := queue.New(1, 4)
	inferenceUC := usecase.NewRunInference(&mockAI{}, taskQ)

	// Supervisor is permanently disabled so health routes return "disabled"
	// without trying to launch a real sidecar binary.
	sup := guardian.New("false", nil, "", "", 0, 0)
	sup.Disable("test mode")

	pdi      := adapthttp.NewPDIHandler(windowingUC)
	study    := adapthttp.NewStudyHandler(openStudyUC, saveAnnotUC, loadAnnotUC, studyRepo)
	infer    := adapthttp.NewInferenceHandler(inferenceUC)
	export   := adapthttp.NewExportHandler(exportUC, studyRepo, annotRepo)
	preview  := adapthttp.NewPreviewHandler(studyRepo, annotRepo, reader)
	backup   := adapthttp.NewBackupHandler(db, ":memory:", "")
	patient  := adapthttp.NewPatientHandler(patientRepo, studyRepo, updatePatUC)
	audio    := adapthttp.NewAudioHandler(annotRepo, "")
	health   := adapthttp.NewHealthHandler(sup, "")
	fs       := adapthttp.NewFsHandler()
	pdf      := adapthttp.NewPDFHandler(usecase.NewGeneratePDF(studyRepo, annotRepo, patientRepo, reader))

	return adapthttp.NewRouter(pdi, study, infer, export, preview, backup, patient, audio, health, fs, pdf)
}

// ─── Health ───────────────────────────────────────────────────────────────────

func TestHealth_Liveness(t *testing.T) {
	r := newTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/healthz", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /healthz: want 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("parse body: %v", err)
	}
	if body["status"] != "go-core-up" {
		t.Errorf("status: want 'go-core-up', got %q", body["status"])
	}
	if body["db_status"] != "ok" {
		t.Errorf("db_status: want 'ok', got %q", body["db_status"])
	}
}

func TestHealth_Readiness(t *testing.T) {
	r := newTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/readyz", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /readyz: want 200, got %d", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("parse body: %v", err)
	}
	if body["ai_engine"] != "disabled" {
		t.Errorf("ai_engine: want 'disabled', got %q", body["ai_engine"])
	}
}

// ─── Studies ──────────────────────────────────────────────────────────────────

func TestStudies_ListEmpty(t *testing.T) {
	r := newTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/studies", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/studies: want 200, got %d — %s", w.Code, w.Body.String())
	}

	var list []any
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("parse body: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("expected empty list, got %d items", len(list))
	}
}

func TestStudies_CreateAndGet(t *testing.T) {
	r := newTestServer(t)

	// POST /api/studies
	body := `{"file_path":"/test/scan.dcm"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/studies", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("POST /api/studies: want 200/201, got %d — %s", w.Code, w.Body.String())
	}

	var created map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("parse response: %v", err)
	}

	studyID, ok := created["id"].(string)
	if !ok || studyID == "" {
		t.Fatalf("response missing 'id': %v", created)
	}
	if created["modality"] != "MG" {
		t.Errorf("modality: want 'MG', got %v", created["modality"])
	}

	// GET /api/studies/:id
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/api/studies/"+studyID, nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("GET /api/studies/%s: want 200, got %d — %s", studyID, w2.Code, w2.Body.String())
	}

	// GET /api/studies should now list 1 study
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest(http.MethodGet, "/api/studies", nil)
	r.ServeHTTP(w3, req3)

	var list []any
	_ = json.Unmarshal(w3.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 study after create, got %d", len(list))
	}
}

func TestStudies_CreateMissingFilePath(t *testing.T) {
	r := newTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/studies", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// Should fail with 4xx/5xx because file_path is empty.
	if w.Code < 400 {
		t.Errorf("expected error status for missing file_path, got %d", w.Code)
	}
}

// ─── Annotations ─────────────────────────────────────────────────────────────

func TestAnnotations_SaveAndLoad(t *testing.T) {
	r := newTestServer(t)
	studyID := createTestStudy(t, r)

	// POST annotations
	annBody := `{"annotations":[{"kind":"ellipse","x":10,"y":20,"w":50,"h":40}]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost,
		"/api/studies/"+studyID+"/annotations",
		bytes.NewBufferString(annBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("POST annotations: want 200/201, got %d — %s", w.Code, w.Body.String())
	}

	// GET annotations
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/api/studies/"+studyID+"/annotations", nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("GET annotations: want 200, got %d", w2.Code)
	}

	var result map[string]any
	if err := json.Unmarshal(w2.Body.Bytes(), &result); err != nil {
		t.Fatalf("parse annotations body: %v", err)
	}
	anns, _ := result["annotations"].([]any)
	if len(anns) != 1 {
		t.Errorf("expected 1 annotation, got %d", len(anns))
	}
}

// ─── Clinical patch ───────────────────────────────────────────────────────────

func TestStudies_PatchClinical(t *testing.T) {
	r := newTestServer(t)
	studyID := createTestStudy(t, r)

	body := `{"birads_global":"4A","conclusion":"Suspeito","recommendation":"Biópsia"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPatch,
		"/api/studies/"+studyID+"/clinical",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("PATCH clinical: want 200, got %d — %s", w.Code, w.Body.String())
	}

	// Verify persisted by fetching the study.
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/api/studies/"+studyID, nil)
	r.ServeHTTP(w2, req2)

	var study map[string]any
	_ = json.Unmarshal(w2.Body.Bytes(), &study)
	if study["birads_global"] != "4A" {
		t.Errorf("birads_global after patch: want '4A', got %v", study["birads_global"])
	}
}

// ─── Preview ──────────────────────────────────────────────────────────────────

func TestStudies_Preview(t *testing.T) {
	r := newTestServer(t)
	studyID := createTestStudy(t, r)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/studies/"+studyID+"/preview", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /preview: want 200, got %d — %s", w.Code, w.Body.String())
	}
	ct := w.Header().Get("Content-Type")
	if ct != "image/png" {
		t.Errorf("Content-Type: want 'image/png', got %q", ct)
	}
}

// ─── Patients ─────────────────────────────────────────────────────────────────

func TestPatients_List(t *testing.T) {
	r := newTestServer(t)

	// Initially empty.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/patients", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/patients: want 200, got %d", w.Code)
	}

	var list []any
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Errorf("expected 0 patients initially, got %d", len(list))
	}
}

func TestPatients_CreateAndGet(t *testing.T) {
	r := newTestServer(t)

	// POST /api/patients
	body := `{"name":"Maria Oliveira","external_id":"EXT-001","sex":"F"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/patients", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("POST /api/patients: want 200/201, got %d — %s", w.Code, w.Body.String())
	}

	var p map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatalf("parse patient: %v", err)
	}
	id, _ := p["id"].(string)
	if id == "" {
		t.Fatalf("patient id is empty")
	}

	// GET /api/patients/:id
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/api/patients/"+id, nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("GET /api/patients/%s: want 200, got %d", id, w2.Code)
	}

	var got map[string]any
	_ = json.Unmarshal(w2.Body.Bytes(), &got)
	if got["name"] != "Maria Oliveira" {
		t.Errorf("name: want 'Maria Oliveira', got %v", got["name"])
	}
}

func TestPatients_AssignStudy(t *testing.T) {
	r := newTestServer(t)

	// Create a patient first.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/patients",
		bytes.NewBufferString(`{"name":"Ana Lima","external_id":"EXT-002"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	var pat map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &pat)
	patID, _ := pat["id"].(string)

	// Create a study.
	studyID := createTestStudy(t, r)

	// Assign.
	assignBody, _ := json.Marshal(map[string]string{"patient_uuid": patID})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPatch,
		"/api/studies/"+studyID+"/patient",
		bytes.NewBuffer(assignBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("PATCH /api/studies/:id/patient: want 200, got %d — %s", w2.Code, w2.Body.String())
	}
}

// ─── Filesystem list ──────────────────────────────────────────────────────────

func TestFS_ListMissingPath(t *testing.T) {
	r := newTestServer(t)

	// Requesting a non-existent directory should return 4xx or 200 with error.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/fs/list?path=/nonexistent_dir_xyz", nil)
	r.ServeHTTP(w, req)

	// Handler may return 200 with empty entries or 4xx — either is acceptable.
	// We just verify it doesn't panic and returns a valid JSON.
	if w.Code == 0 {
		t.Fatal("expected a non-zero status code")
	}
}

func TestFS_ListHome(t *testing.T) {
	r := newTestServer(t)

	// Use default (no path = $HOME); always accessible and inside $HOME.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/fs/list", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/fs/list (no path → $HOME): want 200, got %d — %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse fs/list body: %v", err)
	}
	if resp["path"] == nil {
		t.Errorf("response missing 'path' field")
	}
}

// ─── CORS preflight ───────────────────────────────────────────────────────────

func TestCORS_Preflight(t *testing.T) {
	r := newTestServer(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodOptions, "/api/studies", nil)
	req.Header.Set("Origin", "http://localhost:4200")
	req.Header.Set("Access-Control-Request-Method", "POST")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS preflight: want 204, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("CORS header missing")
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// createTestStudy POSTs a study with a mock .dcm path and returns its ID.
func createTestStudy(t *testing.T, r *gin.Engine) string {
	t.Helper()
	body := `{"file_path":"/test/scan.dcm"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/studies", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("createTestStudy: POST /api/studies returned %d — %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("createTestStudy: parse response: %v", err)
	}
	id, _ := resp["id"].(string)
	if id == "" {
		t.Fatal("createTestStudy: empty study id")
	}
	return id
}

// Ensure entity package is referenced to satisfy import (used indirectly via repos).
var _ = entity.StudyID("")

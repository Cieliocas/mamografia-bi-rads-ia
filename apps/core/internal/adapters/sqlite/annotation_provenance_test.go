package sqlite_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	sqliteadapter "mammo/apps/core/internal/adapters/sqlite"
	"mammo/apps/core/internal/domain/entity"
)

// Provenance is what makes the exported dataset usable for retraining: without
// it, an annotation accepted from the model and one drawn from scratch are the
// same row. These tests pin the round-trip through SQLite.

func openAnnotationRepo(t *testing.T) (*sqliteadapter.AnnotationRepository, *sql.DB) {
	t.Helper()
	db, err := sqliteadapter.Open(":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// Annotations reference a study by foreign key.
	studies := sqliteadapter.NewStudyRepository(db)
	if err := studies.Save(context.Background(), &entity.Study{
		ID:        entity.StudyID("study-prov"),
		PatientID: "P1",
		StudyDate: time.Now(),
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("seed study: %v", err)
	}
	return sqliteadapter.NewAnnotationRepository(db), db
}

func loadOne(t *testing.T, repo *sqliteadapter.AnnotationRepository, id string) *entity.Annotation {
	t.Helper()
	anns, err := repo.LoadByStudyID(context.Background(), "study-prov")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	for _, a := range anns {
		if string(a.ID) == id {
			return a
		}
	}
	t.Fatalf("annotation %s not found", id)
	return nil
}

func TestAnnotationProvenance_AcceptedRoundTrip(t *testing.T) {
	repo, _ := openAnnotationRepo(t)
	ctx := context.Background()

	// Accepted as-is: the human geometry equals the model's box.
	box := &entity.BoundingBox{X: 734, Y: 867, Width: 175, Height: 165}
	if err := repo.Save(ctx, "study-prov", &entity.Annotation{
		ID:           "ann-accepted",
		Kind:         entity.AnnotationBoundingBox,
		BBox:         box,
		Source:       entity.SourceAIAccepted,
		ModelID:      "cascade-hybrid-yolo11n-onnx",
		AIConfidence: 0.64,
		AIKind:       "mass",
		AIBirads:     "3",
		AIBBox:       &entity.BoundingBox{X: 734, Y: 867, Width: 175, Height: 165},
	}); err != nil {
		t.Fatal(err)
	}

	got := loadOne(t, repo, "ann-accepted")
	if got.Source != entity.SourceAIAccepted {
		t.Errorf("source = %q, want ai_accepted", got.Source)
	}
	if got.ModelID != "cascade-hybrid-yolo11n-onnx" {
		t.Errorf("model_id = %q", got.ModelID)
	}
	if got.AIConfidence != 0.64 || got.AIKind != "mass" || got.AIBirads != "3" {
		t.Errorf("ai fields = %v/%q/%q", got.AIConfidence, got.AIKind, got.AIBirads)
	}
	if got.AIBBox == nil || *got.AIBBox != *box {
		t.Errorf("ai_bbox = %+v, want %+v", got.AIBBox, box)
	}
}

func TestAnnotationProvenance_EditedKeepsOriginalBox(t *testing.T) {
	repo, _ := openAnnotationRepo(t)
	ctx := context.Background()

	// The radiologist moved the box; the model's original must survive, because
	// the pair (suggested, corrected) is the signal a retraining set is made of.
	suggested := &entity.BoundingBox{X: 100, Y: 100, Width: 50, Height: 50}
	corrected := &entity.BoundingBox{X: 140, Y: 132, Width: 60, Height: 48}
	if err := repo.Save(ctx, "study-prov", &entity.Annotation{
		ID:      "ann-edited",
		Kind:    entity.AnnotationBoundingBox,
		BBox:    corrected,
		Source:  entity.SourceAIEdited,
		ModelID: "m1",
		AIBBox:  suggested,
	}); err != nil {
		t.Fatal(err)
	}

	got := loadOne(t, repo, "ann-edited")
	if got.Source != entity.SourceAIEdited {
		t.Errorf("source = %q, want ai_edited", got.Source)
	}
	if *got.BBox != *corrected {
		t.Errorf("human bbox = %+v, want %+v", got.BBox, corrected)
	}
	if got.AIBBox == nil || *got.AIBBox != *suggested {
		t.Errorf("ai_bbox = %+v, want the ORIGINAL %+v", got.AIBBox, suggested)
	}
}

func TestAnnotationProvenance_RejectedHasNoHumanGeometry(t *testing.T) {
	repo, _ := openAnnotationRepo(t)
	ctx := context.Background()

	if err := repo.Save(ctx, "study-prov", &entity.Annotation{
		ID:           "ann-rejected",
		Kind:         entity.AnnotationBoundingBox,
		BBox:         &entity.BoundingBox{}, // radiologist asserted nothing
		Source:       entity.SourceAIRejected,
		ModelID:      "m1",
		AIConfidence: 0.31,
		AIBBox:       &entity.BoundingBox{X: 10, Y: 20, Width: 30, Height: 40},
	}); err != nil {
		t.Fatal(err)
	}

	got := loadOne(t, repo, "ann-rejected")
	if got.Source != entity.SourceAIRejected {
		t.Errorf("source = %q, want ai_rejected", got.Source)
	}
	if got.BBox.Width != 0 || got.BBox.Height != 0 {
		t.Errorf("rejected annotation should carry no human geometry, got %+v", got.BBox)
	}
	if got.AIBBox == nil || got.AIBBox.Width != 30 {
		t.Errorf("ai_bbox lost: %+v", got.AIBBox)
	}
}

func TestAnnotationProvenance_LegacyRowsReadAsManual(t *testing.T) {
	repo, db := openAnnotationRepo(t)

	// Simulate a row written before migration 007 by inserting only the columns
	// that existed then; the DEFAULTs must carry the rest.
	if _, err := db.Exec(
		`INSERT INTO annotations (id, study_id, finding_id, kind, data, label, notes)
		 VALUES (?, ?, '', 'bbox', '{"x":1,"y":2,"w":3,"h":4}', 'antiga', '')`,
		"ann-legacy", "study-prov"); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	got := loadOne(t, repo, "ann-legacy")
	if got.Source != entity.SourceManual {
		t.Errorf("legacy row source = %q, want manual", got.Source)
	}
	if got.AIBBox != nil {
		t.Errorf("legacy row should have no ai_bbox, got %+v", got.AIBBox)
	}
	if got.BBox.Width != 3 {
		t.Errorf("legacy geometry lost: %+v", got.BBox)
	}
}

func TestAnnotationProvenance_GeometryResaveKeepsAIFields(t *testing.T) {
	repo, _ := openAnnotationRepo(t)
	ctx := context.Background()

	base := &entity.Annotation{
		ID: "ann-resave", Kind: entity.AnnotationBoundingBox,
		BBox:    &entity.BoundingBox{X: 1, Y: 1, Width: 10, Height: 10},
		Source:  entity.SourceAIAccepted,
		ModelID: "m1", AIConfidence: 0.9, AIKind: "mass",
		AIBBox: &entity.BoundingBox{X: 1, Y: 1, Width: 10, Height: 10},
	}
	if err := repo.Save(ctx, "study-prov", base); err != nil {
		t.Fatal(err)
	}

	// A later save that only carries geometry (e.g. autosave after a nudge)
	// must not blank the provenance already recorded.
	if err := repo.Save(ctx, "study-prov", &entity.Annotation{
		ID: "ann-resave", Kind: entity.AnnotationBoundingBox,
		BBox:   &entity.BoundingBox{X: 5, Y: 5, Width: 12, Height: 12},
		Source: entity.SourceAIEdited,
	}); err != nil {
		t.Fatal(err)
	}

	got := loadOne(t, repo, "ann-resave")
	if got.Source != entity.SourceAIEdited {
		t.Errorf("source = %q, want ai_edited", got.Source)
	}
	if got.ModelID != "m1" || got.AIKind != "mass" || got.AIConfidence != 0.9 {
		t.Errorf("provenance blanked by geometry-only re-save: %+v", got)
	}
	if got.AIBBox == nil || got.AIBBox.Width != 10 {
		t.Errorf("original ai_bbox lost on re-save: %+v", got.AIBBox)
	}
}

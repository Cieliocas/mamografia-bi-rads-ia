package sqlite_test

import (
	"context"
	"testing"
	"time"

	sqliteadapter "mammo/apps/core/internal/adapters/sqlite"
	"mammo/apps/core/internal/domain/entity"
)

func openTestDB(t *testing.T) *sqliteadapter.StudyRepository {
	t.Helper()
	db, err := sqliteadapter.Open(":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return sqliteadapter.NewStudyRepository(db)
}

func TestStudyRepository_SaveAndFind(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()

	study := &entity.Study{
		ID:        entity.StudyID("study-001"),
		PatientID: "P123",
		StudyDate: time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
		CreatedAt: time.Now(),
	}

	if err := repo.Save(ctx, study); err != nil {
		t.Fatal(err)
	}

	got, err := repo.FindByID(ctx, "study-001")
	if err != nil {
		t.Fatal(err)
	}
	if got.PatientID != "P123" {
		t.Errorf("expected P123 got %s", got.PatientID)
	}
}

func TestStudyRepository_List(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()

	for i, pid := range []string{"A", "B", "C"} {
		_ = repo.Save(ctx, &entity.Study{
			ID:        entity.StudyID("s" + string(rune('0'+i))),
			PatientID: pid,
			CreatedAt: time.Now(),
		})
	}

	studies, err := repo.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(studies) != 3 {
		t.Errorf("expected 3 studies got %d", len(studies))
	}
}

func TestStudyRepository_Delete(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()

	_ = repo.Save(ctx, &entity.Study{ID: "del-me", CreatedAt: time.Now()})
	if err := repo.Delete(ctx, "del-me"); err != nil {
		t.Fatal(err)
	}
	_, err := repo.FindByID(ctx, "del-me")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

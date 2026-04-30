package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"mammo/apps/core/internal/domain/entity"
)

// AnnotationRepository is the SQLite implementation of ports/outbound.AnnotationRepository.
type AnnotationRepository struct {
	db *sql.DB
}

func NewAnnotationRepository(db *sql.DB) *AnnotationRepository {
	return &AnnotationRepository{db: db}
}

func (r *AnnotationRepository) Save(ctx context.Context, a *entity.Annotation) error {
	data, err := marshalAnnotationData(a)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO annotations (id, study_id, finding_id, kind, data)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data`,
		string(a.ID), "", "", string(a.Kind), data,
	)
	return err
}

func (r *AnnotationRepository) LoadByStudyID(ctx context.Context, studyID string) ([]*entity.Annotation, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, kind, data FROM annotations WHERE study_id = ? ORDER BY created_at`, studyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*entity.Annotation
	for rows.Next() {
		var id, kind, data string
		if err := rows.Scan(&id, &kind, &data); err != nil {
			return nil, err
		}
		ann, err := unmarshalAnnotation(id, entity.AnnotationKind(kind), data)
		if err != nil {
			return nil, err
		}
		result = append(result, ann)
	}
	return result, rows.Err()
}

func (r *AnnotationRepository) DeleteByStudyID(ctx context.Context, studyID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM annotations WHERE study_id = ?`, studyID)
	return err
}

// ------- helpers -------

type bboxJSON struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type pointJSON struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func marshalAnnotationData(a *entity.Annotation) (string, error) {
	var v any
	switch a.Kind {
	case entity.AnnotationBoundingBox:
		if a.BBox != nil {
			v = bboxJSON{X: a.BBox.X, Y: a.BBox.Y, W: a.BBox.Width, H: a.BBox.Height}
		}
	case entity.AnnotationPoint:
		if a.Point != nil {
			v = pointJSON{X: a.Point.X, Y: a.Point.Y}
		}
	case entity.AnnotationPolygon:
		if a.Polygon != nil {
			v = a.Polygon.Points
		}
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", fmt.Errorf("marshal annotation: %w", err)
	}
	return string(b), nil
}

func unmarshalAnnotation(id string, kind entity.AnnotationKind, data string) (*entity.Annotation, error) {
	ann := &entity.Annotation{ID: entity.AnnotationID(id), Kind: kind}
	switch kind {
	case entity.AnnotationBoundingBox:
		var b bboxJSON
		if err := json.Unmarshal([]byte(data), &b); err != nil {
			return nil, err
		}
		ann.BBox = &entity.BoundingBox{X: b.X, Y: b.Y, Width: b.W, Height: b.H}
	case entity.AnnotationPoint:
		var p pointJSON
		if err := json.Unmarshal([]byte(data), &p); err != nil {
			return nil, err
		}
		ann.Point = &entity.Point{X: p.X, Y: p.Y}
	case entity.AnnotationPolygon:
		var pts []entity.Point
		if err := json.Unmarshal([]byte(data), &pts); err != nil {
			return nil, err
		}
		ann.Polygon = &entity.Polygon{Points: pts}
	}
	return ann, nil
}

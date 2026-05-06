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

func (r *AnnotationRepository) Save(ctx context.Context, studyID string, a *entity.Annotation) error {
	data, err := marshalAnnotationData(a)
	if err != nil {
		return err
	}
	// When audio fields are empty (geometry-only save), preserve whatever is
	// already stored in the row so voice notes survive re-saves.
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO annotations (id, study_id, finding_id, kind, data, audio_path, audio_duration_ms, audio_transcript)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			kind              = excluded.kind,
			data              = excluded.data,
			audio_path        = CASE WHEN excluded.audio_path != '' THEN excluded.audio_path ELSE audio_path END,
			audio_duration_ms = CASE WHEN excluded.audio_path != '' THEN excluded.audio_duration_ms ELSE audio_duration_ms END,
			audio_transcript  = CASE WHEN excluded.audio_path != '' THEN excluded.audio_transcript ELSE audio_transcript END`,
		string(a.ID), studyID, "", string(a.Kind), data,
		a.AudioPath, a.AudioDurationMs, a.AudioTranscript,
	)
	return err
}

func (r *AnnotationRepository) DeleteByStudyIDExcept(ctx context.Context, studyID string, keep map[string]struct{}) error {
	if len(keep) == 0 {
		_, err := r.db.ExecContext(ctx, `DELETE FROM annotations WHERE study_id = ?`, studyID)
		return err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id FROM annotations WHERE study_id = ?`, studyID)
	if err != nil {
		return err
	}
	var toDelete []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		if _, kept := keep[id]; !kept {
			toDelete = append(toDelete, id)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, id := range toDelete {
		if _, err := r.db.ExecContext(ctx, `DELETE FROM annotations WHERE id = ?`, id); err != nil {
			return err
		}
	}
	return nil
}

func (r *AnnotationRepository) LoadByStudyID(ctx context.Context, studyID string) ([]*entity.Annotation, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, kind, data, audio_path, audio_duration_ms, audio_transcript
		 FROM annotations WHERE study_id = ? ORDER BY created_at`, studyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*entity.Annotation
	for rows.Next() {
		var id, kind, data, audioPath, audioTranscript string
		var audioDurationMs int
		if err := rows.Scan(&id, &kind, &data, &audioPath, &audioDurationMs, &audioTranscript); err != nil {
			return nil, err
		}
		ann, err := unmarshalAnnotation(id, entity.AnnotationKind(kind), data)
		if err != nil {
			return nil, err
		}
		ann.AudioPath = audioPath
		ann.AudioDurationMs = audioDurationMs
		ann.AudioTranscript = audioTranscript
		result = append(result, ann)
	}
	return result, rows.Err()
}

// FindByID returns a single annotation. Used by the audio handler to verify
// existence before attaching a recording.
func (r *AnnotationRepository) FindByID(ctx context.Context, id string) (*entity.Annotation, string, error) {
	var studyID, kind, data, audioPath, audioTranscript string
	var audioDurationMs int
	err := r.db.QueryRowContext(ctx,
		`SELECT study_id, kind, data, audio_path, audio_duration_ms, audio_transcript
		 FROM annotations WHERE id = ?`, id,
	).Scan(&studyID, &kind, &data, &audioPath, &audioDurationMs, &audioTranscript)
	if err != nil {
		return nil, "", err
	}
	ann, err := unmarshalAnnotation(id, entity.AnnotationKind(kind), data)
	if err != nil {
		return nil, studyID, err
	}
	ann.AudioPath = audioPath
	ann.AudioDurationMs = audioDurationMs
	ann.AudioTranscript = audioTranscript
	return ann, studyID, nil
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

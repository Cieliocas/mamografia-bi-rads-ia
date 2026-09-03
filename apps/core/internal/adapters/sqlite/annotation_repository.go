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
	aiBBox, err := marshalAIBBox(a.AIBBox)
	if err != nil {
		return err
	}
	// When audio fields are empty (geometry-only save), preserve whatever is
	// already stored in the row so voice notes survive re-saves. The same
	// applies to the AI provenance fields — see the ON CONFLICT clause.
	//
	// study_id is deliberately NOT in the ON CONFLICT update: an annotation does
	// not migrate between studies. Ids are UUIDs minted per study, so a
	// collision across studies would signal a bug upstream, and silently
	// re-parenting the row would hide it.
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO annotations (id, study_id, finding_id, kind, data, label, notes, audio_path, audio_duration_ms, audio_transcript,
		                         source, model_id, ai_confidence, ai_kind, ai_birads, ai_bbox)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			kind              = excluded.kind,
			data              = excluded.data,
			label             = excluded.label,
			notes             = excluded.notes,
			audio_path        = CASE WHEN excluded.audio_path != '' THEN excluded.audio_path ELSE audio_path END,
			audio_duration_ms = CASE WHEN excluded.audio_path != '' THEN excluded.audio_duration_ms ELSE audio_duration_ms END,
			audio_transcript  = CASE WHEN excluded.audio_path != '' THEN excluded.audio_transcript ELSE audio_transcript END,
			source            = excluded.source,
			-- The AI fields describe the suggestion this annotation came from,
			-- which never changes once recorded. A later geometry-only re-save
			-- must not blank them, so keep whatever is already stored.
			model_id          = CASE WHEN excluded.model_id != '' THEN excluded.model_id ELSE model_id END,
			ai_confidence     = CASE WHEN excluded.model_id != '' THEN excluded.ai_confidence ELSE ai_confidence END,
			ai_kind           = CASE WHEN excluded.model_id != '' THEN excluded.ai_kind ELSE ai_kind END,
			ai_birads         = CASE WHEN excluded.model_id != '' THEN excluded.ai_birads ELSE ai_birads END,
			ai_bbox           = CASE WHEN excluded.ai_bbox  != '' THEN excluded.ai_bbox  ELSE ai_bbox  END`,
		string(a.ID), studyID, "", string(a.Kind), data,
		a.Label, a.Notes,
		a.AudioPath, a.AudioDurationMs, a.AudioTranscript,
		string(a.Source.Normalize()), a.ModelID, a.AIConfidence, a.AIKind, a.AIBirads, aiBBox,
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
		`SELECT id, kind, data, label, notes, audio_path, audio_duration_ms, audio_transcript,
		        source, model_id, ai_confidence, ai_kind, ai_birads, ai_bbox
		 FROM annotations WHERE study_id = ? ORDER BY created_at`, studyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*entity.Annotation
	for rows.Next() {
		var id, kind, data, label, notes, audioPath, audioTranscript string
		var source, modelID, aiKind, aiBirads, aiBBox string
		var aiConfidence float64
		var audioDurationMs int
		if err := rows.Scan(&id, &kind, &data, &label, &notes, &audioPath, &audioDurationMs, &audioTranscript,
			&source, &modelID, &aiConfidence, &aiKind, &aiBirads, &aiBBox); err != nil {
			return nil, err
		}
		ann, err := unmarshalAnnotation(id, entity.AnnotationKind(kind), data)
		if err != nil {
			return nil, err
		}
		ann.Label = label
		ann.Notes = notes
		ann.AudioPath = audioPath
		ann.AudioDurationMs = audioDurationMs
		ann.AudioTranscript = audioTranscript
		applyProvenance(ann, source, modelID, aiConfidence, aiKind, aiBirads, aiBBox)
		result = append(result, ann)
	}
	return result, rows.Err()
}

// FindByID returns a single annotation. Used by the audio handler to verify
// existence before attaching a recording.
func (r *AnnotationRepository) FindByID(ctx context.Context, id string) (*entity.Annotation, string, error) {
	var studyID, kind, data, label, notes, audioPath, audioTranscript string
	var source, modelID, aiKind, aiBirads, aiBBox string
	var aiConfidence float64
	var audioDurationMs int
	err := r.db.QueryRowContext(ctx,
		`SELECT study_id, kind, data, label, notes, audio_path, audio_duration_ms, audio_transcript,
		        source, model_id, ai_confidence, ai_kind, ai_birads, ai_bbox
		 FROM annotations WHERE id = ?`, id,
	).Scan(&studyID, &kind, &data, &label, &notes, &audioPath, &audioDurationMs, &audioTranscript,
		&source, &modelID, &aiConfidence, &aiKind, &aiBirads, &aiBBox)
	if err != nil {
		return nil, "", err
	}
	ann, err := unmarshalAnnotation(id, entity.AnnotationKind(kind), data)
	if err != nil {
		return nil, studyID, err
	}
	ann.Label = label
	ann.Notes = notes
	ann.AudioPath = audioPath
	ann.AudioDurationMs = audioDurationMs
	ann.AudioTranscript = audioTranscript
	applyProvenance(ann, source, modelID, aiConfidence, aiKind, aiBirads, aiBBox)
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

// marshalAIBBox serialises the model's original box. Empty string when the
// annotation did not come from a suggestion — the column is NOT NULL.
func marshalAIBBox(b *entity.BoundingBox) (string, error) {
	if b == nil {
		return "", nil
	}
	raw, err := json.Marshal(bboxJSON{X: b.X, Y: b.Y, W: b.Width, H: b.Height})
	if err != nil {
		return "", fmt.Errorf("marshal ai_bbox: %w", err)
	}
	return string(raw), nil
}

// applyProvenance fills the provenance fields read from a row. A malformed or
// empty ai_bbox is treated as absent rather than fatal: provenance must never
// be the reason a study fails to open.
func applyProvenance(ann *entity.Annotation, source, modelID string, aiConfidence float64,
	aiKind, aiBirads, aiBBox string) {
	ann.Source = entity.AnnotationSource(source).Normalize()
	ann.ModelID = modelID
	ann.AIConfidence = aiConfidence
	ann.AIKind = aiKind
	ann.AIBirads = aiBirads
	if aiBBox == "" {
		return
	}
	var b bboxJSON
	if err := json.Unmarshal([]byte(aiBBox), &b); err != nil {
		return
	}
	ann.AIBBox = &entity.BoundingBox{X: b.X, Y: b.Y, Width: b.W, Height: b.H}
}

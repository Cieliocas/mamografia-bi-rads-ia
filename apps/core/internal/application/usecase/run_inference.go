package usecase

import (
	"context"
	"fmt"
	"time"

	"mammo/apps/core/internal/infrastructure/queue"
	"mammo/apps/core/internal/ports/outbound"
)

// RunInference enqueues a predict task and calls the AI client.
type RunInference struct {
	aiClient outbound.AIClient
	taskQ    *queue.Queue
}

func NewRunInference(client outbound.AIClient, q *queue.Queue) *RunInference {
	return &RunInference{aiClient: client, taskQ: q}
}

type RunInferenceInput struct {
	ImagePath string `json:"image_path"`
	StudyID   string `json:"study_id,omitempty"`
}

type RunInferenceOutput struct {
	TaskID   string
	Findings []*outbound.RichFinding
	ModelID  string
}

func (uc *RunInference) Execute(ctx context.Context, in RunInferenceInput) (*RunInferenceOutput, error) {
	if in.ImagePath == "" {
		return nil, fmt.Errorf("image_path is required")
	}

	taskID := fmt.Sprintf("infer-%d", time.Now().UnixNano())

	uc.taskQ.Enqueue(queue.Task{ID: taskID, Payload: map[string]any{
		"image_path": in.ImagePath,
		"study_id":   in.StudyID,
	}})

	candidates, err := uc.aiClient.Predict(ctx, in.ImagePath)
	if err != nil {
		return nil, fmt.Errorf("run_inference: %w", err)
	}

	return &RunInferenceOutput{
		TaskID:   taskID,
		Findings: candidates.Findings,
		ModelID:  candidates.ModelID,
	}, nil
}

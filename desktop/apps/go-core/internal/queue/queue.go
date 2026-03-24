package queue

import (
	"context"
	"sync"
)

type Task struct {
	ID      string
	Payload map[string]any
}

type Processor interface {
	Process(context.Context, Task) error
}

type Queue struct {
	ch      chan Task
	wg      sync.WaitGroup
	workers int
}

func New(workers int, buffer int) *Queue {
	if workers <= 0 {
		workers = 1
	}
	if buffer <= 0 {
		buffer = 32
	}
	return &Queue{ch: make(chan Task, buffer), workers: workers}
}

func (q *Queue) Start(ctx context.Context, processor Processor) {
	for i := 0; i < q.workers; i++ {
		q.wg.Add(1)
		go func() {
			defer q.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case task := <-q.ch:
					_ = processor.Process(ctx, task)
				}
			}
		}()
	}
}

func (q *Queue) Enqueue(task Task) {
	q.ch <- task
}

func (q *Queue) Stop() {
	close(q.ch)
	q.wg.Wait()
}

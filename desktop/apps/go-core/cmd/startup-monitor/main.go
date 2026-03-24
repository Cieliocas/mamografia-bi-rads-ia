package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type Event struct {
	Event   string `json:"event"`
	Message string `json:"message"`
}

func main() {
	endpoint := "http://127.0.0.1:8088/startup/status"
	if custom := os.Getenv("STARTUP_STATUS_URL"); custom != "" {
		endpoint = custom
	}

	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		resp, err := http.Get(endpoint)
		if err == nil && resp.StatusCode == http.StatusOK {
			_ = resp.Body.Close()
			emit(Event{Event: "ready", Message: "AI sidecar and Go core are ready"})
			return
		}
		if resp != nil {
			_ = resp.Body.Close()
		}
		time.Sleep(1 * time.Second)
	}

	emit(Event{Event: "timeout", Message: "startup monitor timed out"})
	os.Exit(1)
}

func emit(evt Event) {
	bytes, _ := json.Marshal(evt)
	fmt.Println(string(bytes))
}

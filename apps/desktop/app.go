package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OpenFileDialog opens a native OS file picker and returns the chosen path.
// Returns an empty string if the user cancels.
func (a *App) OpenFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Abrir Imagem",
		Filters: []runtime.FileFilter{
			{DisplayName: "Imagens DICOM (*.dcm)", Pattern: "*.dcm"},
			{DisplayName: "Imagens (*.png;*.jpg;*.jpeg)", Pattern: "*.png;*.jpg;*.jpeg"},
			{DisplayName: "Todos os arquivos (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return ""
	}
	return path
}

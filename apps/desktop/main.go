package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()

	// ── Menu nativo macOS ────────────────────────────────────────────────────
	appMenu := menu.NewMenu()

	// File
	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("Abrir Imagem…", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		app.OpenFileDialog()
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Sair", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	// Edit (padrão do sistema — cut/copy/paste funcionam via AppKit)
	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Desfazer", keys.CmdOrCtrl("z"), nil)
	editMenu.AddText("Refazer", keys.Combo("z", keys.CmdOrCtrlKey, keys.ShiftKey), nil)
	editMenu.AddSeparator()
	editMenu.AddText("Recortar",  keys.CmdOrCtrl("x"), nil)
	editMenu.AddText("Copiar",    keys.CmdOrCtrl("c"), nil)
	editMenu.AddText("Colar",     keys.CmdOrCtrl("v"), nil)
	editMenu.AddText("Selecionar tudo", keys.CmdOrCtrl("a"), nil)

	// View
	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Tela cheia", keys.Key("f"), func(_ *menu.CallbackData) {
		runtime.WindowToggleMaximise(app.ctx)
	})

	// IA
	aiMenu := appMenu.AddSubmenu("IA")
	aiMenu.AddText("Executar inferência", keys.CmdOrCtrl("r"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:run-inference")
	})

	// Help
	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("Sobre o AIdentify", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "AIdentify",
			Message: "v0.1.0 — Radiology Precision AI\nIA assistida para mamografia BI-RADS\n\n© 2024 ICIT",
		})
	})

	// ── App options ──────────────────────────────────────────────────────────
	err := wails.Run(&options.App{
		Title:     "AIdentify",
		Width:     1440,
		Height:    900,
		MinWidth:  1200,
		MinHeight: 720,
		Menu:      appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			// TitlebarAppearsTransparent + HideTitle + FullSizeContent dá o
			// visual "sem barra" com traffic lights visíveis. UseToolbar:false
			// mantém o corner radius padrão do macOS (~9 px) — igual Finder,
			// Safari, Xcode — sem o raio exagerado que o toolbar introduz.
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               false,
				FullSizeContent:            true,
				UseToolbar:                 false,
				HideToolbarSeparator:       true,
			},
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "AIdentify",
				Message: "v0.1.0 — Radiology Precision AI\n© 2024 ICIT",
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

package http

import (
	"archive/zip"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

func removeIfExists(path string) error {
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	return os.Remove(path)
}

// BackupHandler exposes GET /api/backup. It streams a ZIP containing:
//   - aidentify.db — consistent SQLite snapshot via VACUUM INTO
//   - audio/**/*.webm — all voice note recordings
//
// The radiologist can use this to migrate to a new machine or roll back.
type BackupHandler struct {
	db        *sql.DB
	sqlitePath string
	localRoot  string
}

func NewBackupHandler(db *sql.DB, sqlitePath, localRoot string) *BackupHandler {
	return &BackupHandler{db: db, sqlitePath: sqlitePath, localRoot: localRoot}
}

func (h *BackupHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/backup", h.download)
}

func (h *BackupHandler) download(c *gin.Context) {
	// 1. VACUUM INTO a temp file for a consistent DB snapshot.
	tmp := fmt.Sprintf("%s.backup-%d.db", h.sqlitePath, time.Now().Unix())
	if _, err := h.db.ExecContext(c.Request.Context(), "VACUUM INTO ?", tmp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "backup failed: " + err.Error()})
		return
	}
	defer func() { _ = removeIfExists(tmp) }()

	filename := fmt.Sprintf("aidentify-backup-%s.zip", time.Now().Format("20060102-150405"))
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Header("Content-Type", "application/zip")

	zw := zip.NewWriter(c.Writer)

	// 2. Add DB snapshot.
	if err := addFileToZip(zw, tmp, "aidentify.db"); err != nil {
		// Headers already sent; nothing to do but log.
		_ = zw.Close()
		return
	}

	// 3. Add audio files (best-effort; missing dir is not an error).
	audioDir := filepath.Join(h.localRoot, "audio")
	_ = filepath.Walk(audioDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(h.localRoot, path)
		return addFileToZip(zw, path, rel)
	})

	_ = zw.Close()
}

func addFileToZip(zw *zip.Writer, srcPath, zipName string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}

	hdr, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	hdr.Name = zipName
	hdr.Method = zip.Deflate

	w, err := zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}

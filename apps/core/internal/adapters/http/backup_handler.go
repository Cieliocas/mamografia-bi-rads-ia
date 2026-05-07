package http

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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
	rg.POST("/restore", h.restore)
}

// restore accepts a ZIP backup (same format produced by GET /backup) and stages
// it for the next server restart.
//
// Because SQLite cannot be hot-swapped while open, we write the incoming DB to
// <sqlitePath>.restore.  On the next process start, main() detects the file and
// applies the rename before opening the live database.
//
// Audio files embedded in the ZIP are written immediately (they are not open
// exclusively, so an atomic replace is safe).
func (h *BackupHandler) restore(c *gin.Context) {
	uploadedFile, fileHdr, err := c.Request.FormFile("backup")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "backup file required (field: backup): " + err.Error()})
		return
	}
	defer uploadedFile.Close()

	// Read the entire upload into memory so we can open it as a ZIP.
	// Backups are typically < 100 MB; for larger ones a temp file would be better.
	if fileHdr.Size > 200<<20 { // 200 MB guard
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "backup file exceeds 200 MB limit"})
		return
	}

	data := make([]byte, fileHdr.Size)
	if _, err := io.ReadFull(uploadedFile, data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "read upload: " + err.Error()})
		return
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a valid ZIP backup: " + err.Error()})
		return
	}

	dbRestored := false
	audioCount := 0

	for _, zf := range zr.File {
		switch {
		case zf.Name == "aidentify.db":
			if err := extractZipEntryToFile(zf, h.sqlitePath+".restore"); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "extract db: " + err.Error()})
				return
			}
			dbRestored = true

		case strings.HasPrefix(zf.Name, "audio/") && !zf.FileInfo().IsDir():
			dest := filepath.Join(h.localRoot, filepath.FromSlash(zf.Name))
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
				continue
			}
			if err := extractZipEntryToFile(zf, dest); err == nil {
				audioCount++
			}
		}
	}

	if !dbRestored {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ZIP does not contain aidentify.db"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":      "pending_restart",
		"audio_files": audioCount,
		"message":     fmt.Sprintf("Backup recebido (%d arquivos de áudio restaurados). Feche e reabra o AIdentify para aplicar o banco de dados.", audioCount),
	})
}

func extractZipEntryToFile(zf *zip.File, dest string) error {
	rc, err := zf.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.CreateTemp(filepath.Dir(dest), ".restore-*")
	if err != nil {
		return err
	}
	tmpName := out.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		return err
	}
	out.Close()
	return os.Rename(tmpName, dest)
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

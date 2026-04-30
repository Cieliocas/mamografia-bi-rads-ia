package http

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func removeIfExists(path string) error {
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	return os.Remove(path)
}

// BackupHandler exposes /api/backup so the radiologist can download a snapshot
// of the SQLite database. Useful before reinstalling the app or moving to a
// new machine. Uses SQLite's online backup ("VACUUM INTO") so the snapshot is
// consistent even with active writers.
type BackupHandler struct {
	db         *sql.DB
	sqlitePath string
}

func NewBackupHandler(db *sql.DB, sqlitePath string) *BackupHandler {
	return &BackupHandler{db: db, sqlitePath: sqlitePath}
}

func (h *BackupHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/backup", h.download)
}

func (h *BackupHandler) download(c *gin.Context) {
	tmp := fmt.Sprintf("%s.backup-%d.db", h.sqlitePath, time.Now().Unix())
	if _, err := h.db.ExecContext(c.Request.Context(), "VACUUM INTO ?", tmp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "backup failed: " + err.Error()})
		return
	}

	filename := fmt.Sprintf("aidentify-%s.db", time.Now().Format("20060102-150405"))
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.FileAttachment(tmp, filename)

	// Best-effort cleanup: c.FileAttachment streams synchronously, so by the
	// time it returns the file has been served.
	defer func() {
		_ = removeIfExists(tmp)
	}()
}

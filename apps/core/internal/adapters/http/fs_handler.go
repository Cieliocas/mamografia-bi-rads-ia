package http

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// FsHandler serves GET /api/fs/list?path=<dir>
// Returns directory entries for a given absolute path.
// Security: path must be inside $HOME.
type FsHandler struct{}

func NewFsHandler() *FsHandler { return &FsHandler{} }

func (h *FsHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/fs/list", h.list)
}

type fsEntry struct {
	Name  string    `json:"name"`
	Type  string    `json:"type"` // "dir" | "file"
	Size  int64     `json:"size"`
	Mtime time.Time `json:"mtime"`
	Ext   string    `json:"ext,omitempty"`
	// IsImage is true when the entry is openable by the viewer — either by
	// extension or, for extensionless files, by the DICM magic.
	IsImage bool `json:"is_image,omitempty"`
}

type fsListResponse struct {
	Path    string    `json:"path"`
	Entries []fsEntry `json:"entries"`
}

var imageExts = map[string]bool{
	".dcm": true, ".dicom": true, ".png": true, ".jpg": true, ".jpeg": true,
}

// maxSniffs caps how many extensionless files a single listing will probe, so a
// directory full of unrelated blobs cannot turn a listing into a scan.
const maxSniffs = 512

// looksLikeDICOM reports whether the file carries the DICM magic that PS3.10
// puts at offset 128, after the 128-byte preamble. Real-world DICOM often has
// no extension at all — CD exports and PACS dumps name images like "<incidência>"
// — so extension alone is not a usable test.
func looksLikeDICOM(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	var buf [4]byte
	if _, err := f.ReadAt(buf[:], 128); err != nil {
		return false
	}
	return string(buf[:]) == "DICM"
}

func (h *FsHandler) list(c *gin.Context) {
	reqPath := c.Query("path")
	if reqPath == "" {
		// Default to $HOME when no path given.
		reqPath = os.Getenv("HOME")
	}

	// Resolve to absolute, clean path.
	abs, err := filepath.Abs(reqPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	// Security guard: path must be inside $HOME.
	home := os.Getenv("HOME")
	if home != "" && !strings.HasPrefix(abs, home) {
		c.JSON(http.StatusForbidden, gin.H{"error": "path outside $HOME"})
		return
	}

	entries, err := os.ReadDir(abs)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	result := make([]fsEntry, 0, len(entries))
	sniffs := 0
	for _, e := range entries {
		// Skip hidden files/dirs (dotfiles).
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		kind := "file"
		if e.IsDir() {
			kind = "dir"
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		entry := fsEntry{
			Name:  e.Name(),
			Type:  kind,
			Size:  info.Size(),
			Mtime: info.ModTime(),
		}
		if kind == "file" {
			entry.Ext = ext
			switch {
			case imageExts[ext]:
				entry.IsImage = true
			// PS3.10 fixes the name "DICOMDIR" for the media index. It carries
			// the DICM magic but holds no pixel data, so the viewer must not
			// offer it as an image.
			case ext == "" && e.Name() != "DICOMDIR" && info.Size() > 132 && sniffs < maxSniffs:
				sniffs++
				entry.IsImage = looksLikeDICOM(filepath.Join(abs, e.Name()))
			}
		}
		result = append(result, entry)
	}

	// Dirs first, then files; both sorted alphabetically.
	sort.Slice(result, func(i, j int) bool {
		if result[i].Type != result[j].Type {
			return result[i].Type == "dir"
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})

	c.JSON(http.StatusOK, fsListResponse{Path: abs, Entries: result})
}

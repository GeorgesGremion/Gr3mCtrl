package storage

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type FSItem struct {
	Name    string    `json:"name"`
	IsDir   bool      `json:"is_dir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"mod_time"`
}

func resolveSharePath(shareName, rel string) (string, error) {
	st, err := loadShares()
	if err != nil {
		return "", err
	}
	base := ""
	for _, s := range st.Shares {
		if s.Name == shareName {
			base = s.Path
			break
		}
	}
	if base == "" {
		return "", errors.New("share nicht gefunden")
	}
	base = filepath.Clean(base)
	target := filepath.Join(base, filepath.Clean("/"+rel))
	// Security: ensure target stays under base
	if relPath, err := filepath.Rel(base, target); err != nil || strings.HasPrefix(relPath, "..") {
		return "", errors.New("ungueltiger pfad")
	}
	return target, nil
}

// GET /api/fs/list?share=<name>&path=<subpath>
func FSList(w http.ResponseWriter, r *http.Request) {
	share := strings.TrimSpace(r.URL.Query().Get("share"))
	rel := strings.TrimSpace(r.URL.Query().Get("path"))
	target, err := resolveSharePath(share, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	items := make([]FSItem, 0, len(entries))
	for _, e := range entries {
		info, _ := e.Info()
		items = append(items, FSItem{
			Name:    e.Name(),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// GET /api/fs/download?share=<name>&path=<file>
func FSDownload(w http.ResponseWriter, r *http.Request) {
	share := strings.TrimSpace(r.URL.Query().Get("share"))
	rel := strings.TrimSpace(r.URL.Query().Get("path"))
	target, err := resolveSharePath(share, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	info, err := os.Stat(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if info.IsDir() {
		http.Error(w, "is directory", http.StatusBadRequest)
		return
	}
	http.ServeFile(w, r, target)
}

// POST /api/fs/mkdir  {share, path}
func FSMkdir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Share string `json:"share"`
		Path  string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	target, err := resolveSharePath(strings.TrimSpace(req.Share), strings.TrimSpace(req.Path))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/fs/delete {share, path}
func FSDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Share string `json:"share"`
		Path  string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	target, err := resolveSharePath(strings.TrimSpace(req.Share), strings.TrimSpace(req.Path))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.RemoveAll(target); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// POST /api/fs/upload multipart: file=<file> share=<share> path=<dir>
func FSUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "parse form: "+err.Error(), http.StatusBadRequest)
		return
	}
	share := strings.TrimSpace(r.FormValue("share"))
	rel := strings.TrimSpace(r.FormValue("path"))
	targetDir, err := resolveSharePath(share, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file fehlt: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	dstPath := filepath.Join(targetDir, filepath.Base(header.Filename))
	dst, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	info, _ := dst.Stat()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(FSItem{
		Name:    header.Filename,
		IsDir:   false,
		Size:    info.Size(),
		ModTime: info.ModTime(),
	})
}

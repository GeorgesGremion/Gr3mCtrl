package storage

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const isoDir = "/var/lib/c0r3nex/isos"

type ISOInfo struct {
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	Path  string `json:"path"`
	Pool  string `json:"pool,omitempty"`
	Mount string `json:"mount,omitempty"`
}

func ensureISODir(pool string) (string, error) {
	if pool != "" {
		path := filepath.Join("/mnt/c0r3nex/pools", pool, "isos")
		return path, os.MkdirAll(path, 0o755)
	}
	return isoDir, os.MkdirAll(isoDir, 0o755)
}

// GET /api/storage/isos?pool=<pool>
func ListISOs(w http.ResponseWriter, r *http.Request) {
	pool := strings.TrimSpace(r.URL.Query().Get("pool"))
	dir, err := ensureISODir(pool)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items := []ISOInfo{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, _ := e.Info()
		items = append(items, ISOInfo{
			Name:  e.Name(),
			Size:  info.Size(),
			Path:  filepath.Join(dir, e.Name()),
			Pool:  pool,
			Mount: dir,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// POST /api/storage/isos (multipart form-data, file field "iso", optional pool field)
func UploadISO(w http.ResponseWriter, r *http.Request) {
	pool := strings.TrimSpace(r.FormValue("pool"))
	dir, err := ensureISODir(pool)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	file, header, err := r.FormFile("iso")
	if err != nil {
		http.Error(w, "kein ISO hochgeladen: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	dstPath := filepath.Join(dir, header.Filename)
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
	json.NewEncoder(w).Encode(ISOInfo{Name: header.Filename, Size: info.Size(), Path: dstPath, Pool: pool, Mount: dir})
}

// DELETE /api/storage/iso/{name}
func DeleteISO(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/storage/iso/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	pool := strings.TrimSpace(r.URL.Query().Get("pool"))
	dir, err := ensureISODir(pool)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	path := filepath.Join(dir, name)
	if err := os.Remove(path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

package storage

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Volume struct {
	Name   string `json:"name"`
	Pool   string `json:"pool"`
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	Format string `json:"format"` // qcow2, raw
	VM     string `json:"vm,omitempty"` // if inside vm/ folder
}

func ListVolumes(w http.ResponseWriter, r *http.Request) {
	st, err := loadPools()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var vols []Volume
	for _, pool := range st.Pools {
		poolDir := filepath.Join("/mnt/gr3mctrl/pools", pool.Name)
		
		// 1. Scan vm/ subdirectories
		vmBase := filepath.Join(poolDir, "vm")
		entries, _ := os.ReadDir(vmBase)
		for _, vmDir := range entries {
			if !vmDir.IsDir() {
				continue
			}
			files, _ := os.ReadDir(filepath.Join(vmBase, vmDir.Name()))
			for _, f := range files {
				if strings.HasSuffix(f.Name(), ".qcow2") || strings.HasSuffix(f.Name(), ".raw") || strings.HasSuffix(f.Name(), ".img") {
					info, _ := f.Info()
					vols = append(vols, Volume{
						Name:   f.Name(),
						Pool:   pool.Name,
						Path:   filepath.Join(vmBase, vmDir.Name(), f.Name()),
						Size:   info.Size(),
						Format: filepath.Ext(f.Name())[1:],
						VM:     vmDir.Name(),
					})
				}
			}
		}

		// 2. Scan volumes/ subdirectory (for detached volumes)
		volBase := filepath.Join(poolDir, "volumes")
		files, _ := os.ReadDir(volBase)
		for _, f := range files {
			if strings.HasSuffix(f.Name(), ".qcow2") || strings.HasSuffix(f.Name(), ".raw") || strings.HasSuffix(f.Name(), ".img") {
				info, _ := f.Info()
				vols = append(vols, Volume{
					Name:   f.Name(),
					Pool:   pool.Name,
					Path:   filepath.Join(volBase, f.Name()),
					Size:   info.Size(),
					Format: filepath.Ext(f.Name())[1:],
				})
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vols)
}

type CreateVolumeRequest struct {
	Name   string `json:"name"`
	Pool   string `json:"pool"`
	SizeGB int    `json:"size_gb"`
	Format string `json:"format"` // qcow2 (default)
}

func CreateVolume(w http.ResponseWriter, r *http.Request) {
	var req CreateVolumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Pool == "" || req.SizeGB <= 0 {
		http.Error(w, "Name, Pool, SizeGB required", http.StatusBadRequest)
		return
	}
	if req.Format == "" {
		req.Format = "qcow2"
	}

	// Create in volumes/ subdir
	dir := filepath.Join("/mnt/gr3mctrl/pools", req.Pool, "volumes")
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, "mkdir failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	filename := req.Name
	if !strings.HasSuffix(filename, "."+req.Format) {
		filename += "." + req.Format
	}
	path := filepath.Join(dir, filename)

	if _, err := os.Stat(path); err == nil {
		http.Error(w, "Volume exists", http.StatusConflict)
		return
	}

	cmd := exec.Command("qemu-img", "create", "-f", req.Format, path, fmt.Sprintf("%dG", req.SizeGB))
	if out, err := cmd.CombinedOutput(); err != nil {
		http.Error(w, "qemu-img failed: "+string(out), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "created", "path": path})
}

func DeleteVolume(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	// Security check: must be in /mnt/gr3mctrl/pools
	if !strings.HasPrefix(path, "/mnt/gr3mctrl/pools") {
		http.Error(w, "invalid path", http.StatusForbidden)
		return
	}

	if err := os.Remove(path); err != nil {
		http.Error(w, "remove failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

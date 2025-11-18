package storage

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
)

const shareFile = "/var/lib/labcore/shares.json"

type Share struct {
	Name       string   `json:"name"`
	Pool       string   `json:"pool"`
	Path       string   `json:"path"`
	SMB        bool     `json:"smb"`
	NFS        bool     `json:"nfs"`
	Comment    string   `json:"comment"`
	Owner      string   `json:"owner"`
	Group      string   `json:"group"`
	Mode       string   `json:"mode"`
	IsPublic   bool     `json:"is_public"`
	Users      []string `json:"users,omitempty"` // legacy
	UsersRead  []string `json:"users_read,omitempty"`
	UsersWrite []string `json:"users_write,omitempty"`
}

type shareState struct {
	Shares []Share `json:"shares"`
}

func loadShares() (shareState, error) {
	st := shareState{}
	data, err := os.ReadFile(shareFile)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return st, nil
		}
		return st, err
	}
	if len(data) == 0 {
		return st, nil
	}
	err = json.Unmarshal(data, &st)
	return st, err
}

func saveShares(st shareState) error {
	tmp := shareFile + ".tmp"
	if err := os.MkdirAll(filepath.Dir(shareFile), 0o755); err != nil {
		return err
	}
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(f).Encode(st); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmp, shareFile)
}

func lookupUser(name string) int {
	u, err := user.Lookup(name)
	if err != nil {
		return -1
	}
	id, _ := strconv.Atoi(u.Uid)
	return id
}

func lookupGroup(name string) int {
	g, err := user.LookupGroup(name)
	if err != nil {
		return -1
	}
	id, _ := strconv.Atoi(g.Gid)
	return id
}

// applySharePermissions sets owner/group/mode recursively (best effort).
func applySharePermissions(path, owner, group, mode string) {
	uid := lookupUser(owner)
	gid := lookupGroup(group)
	var perm os.FileMode
	if mode != "" {
		if m, err := strconv.ParseInt(mode, 8, 32); err == nil {
			perm = os.FileMode(m)
		}
	}
	_ = filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if uid >= 0 || gid >= 0 {
			_ = os.Chown(p, uid, gid)
		}
		if perm != 0 {
			_ = os.Chmod(p, perm)
		}
		return nil
	})
}

// GET /api/storage/shares
func ListShares(w http.ResponseWriter, r *http.Request) {
	st, err := loadShares()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(st.Shares)
}

// POST /api/storage/shares
func CreateShare(w http.ResponseWriter, r *http.Request) {
	var s Share
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	s.Name = strings.TrimSpace(s.Name)
	s.Path = strings.TrimSpace(s.Path)
	if s.Name == "" {
		http.Error(w, "Name erforderlich", http.StatusBadRequest)
		return
	}
	s.Path = ResolveSharePath(s.Pool, s.Name, s.Path)
	if s.Owner == "" {
		s.Owner = "nobody"
	}
	if s.Group == "" {
		s.Group = "nogroup"
	}
	if s.Mode == "" {
		s.Mode = "0775"
	}
	st, err := loadShares()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, existing := range st.Shares {
		if existing.Name == s.Name {
			http.Error(w, "Share existiert bereits", http.StatusConflict)
			return
		}
	}
	if s.Pool != "" {
		pools, _ := loadPools()
		found := false
		for _, p := range pools.Pools {
			if p.Name == s.Pool {
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "Pool nicht gefunden", http.StatusBadRequest)
			return
		}
		_ = EnsurePoolMounted(Pool{Name: s.Pool})
	}
	if err := os.MkdirAll(s.Path, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// apply ownership/mode recursively
	applySharePermissions(s.Path, s.Owner, s.Group, s.Mode)
	_ = ExportShare(s)
	st.Shares = append(st.Shares, s)
	if err := saveShares(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = RebuildSambaConfig()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// DELETE /api/storage/share/{name}
func DeleteShare(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/storage/share/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	st, err := loadShares()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var removed *Share
	filtered := st.Shares[:0]
	for _, s := range st.Shares {
		if s.Name != name {
			filtered = append(filtered, s)
		} else {
			removed = &s
		}
	}
	st.Shares = filtered
	if err := saveShares(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = removeExport(name)
	// remove data on disk
	path := ""
	if removed != nil {
		if strings.TrimSpace(removed.Path) != "" {
			path = removed.Path
		} else {
			path = ResolveSharePath(removed.Pool, removed.Name, "")
		}
	}
	if path != "" {
		_ = os.RemoveAll(path)
	}
	_ = RebuildSambaConfig()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

// PUT /api/storage/share/{name}/move
// Payload: {\"pool\": \"newPool\", \"path\": \"optional override\"}
func MoveShare(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/storage/share/")
	name = strings.TrimSuffix(name, "/move")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	var payload struct {
		Pool string `json:"pool"`
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}

	st, err := loadShares()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var share *Share
	for i := range st.Shares {
		if st.Shares[i].Name == name {
			share = &st.Shares[i]
			break
		}
	}
	if share == nil {
		http.Error(w, "Share nicht gefunden", http.StatusNotFound)
		return
	}

	// Determine source and destination
	srcPath := share.Path
	dstPath := strings.TrimSpace(payload.Path)
	if dstPath == "" {
		dstPath = ResolveSharePath(payload.Pool, share.Name, "")
	}

	if srcPath == dstPath {
		http.Error(w, "Quelle und Ziel sind identisch", http.StatusBadRequest)
		return
	}

	if payload.Pool != "" {
		if err := ensurePoolExists(payload.Pool); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	// Prepare target
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		http.Error(w, "Ziel konnte nicht vorbereitet werden: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Try rename first, fallback to copy
	if err := os.Rename(srcPath, dstPath); err != nil {
		if copyErr := copyDir(srcPath, dstPath); copyErr != nil {
			http.Error(w, "Konnte Share nicht verschieben: "+copyErr.Error(), http.StatusInternalServerError)
			return
		}
		_ = os.RemoveAll(srcPath)
	}

	share.Pool = payload.Pool
	share.Path = dstPath

	// re-apply ownership/mode
	applySharePermissions(dstPath, share.Owner, share.Group, share.Mode)

	if err := saveShares(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = RebuildSambaConfig()
	_ = exec.Command("systemctl", "restart", "smbd").Run()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(share)
}

// copyDir recursively copies src into dst.
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.WriteFile(target, data, info.Mode()); err != nil {
			return err
		}
		return nil
	})
}

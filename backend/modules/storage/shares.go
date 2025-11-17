package storage

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
)

const shareFile = "/var/lib/labcore/shares.json"

type Share struct {
	Name    string `json:"name"`
	Pool    string `json:"pool"`
	Path    string `json:"path"`
	SMB     bool   `json:"smb"`
	NFS     bool   `json:"nfs"`
	Comment string `json:"comment"`
	Owner   string `json:"owner"`
	Group   string `json:"group"`
	Mode    string `json:"mode"`
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
	// apply ownership/mode
	_ = os.Chown(s.Path, lookupUser(s.Owner), lookupGroup(s.Group))
	if mode, err := strconv.ParseInt(s.Mode, 8, 32); err == nil {
		_ = os.Chmod(s.Path, os.FileMode(mode))
	}
	_ = ExportShare(s)
	st.Shares = append(st.Shares, s)
	if err := saveShares(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
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
	filtered := st.Shares[:0]
	for _, s := range st.Shares {
		if s.Name != name {
			filtered = append(filtered, s)
		}
	}
	st.Shares = filtered
	if err := saveShares(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = removeExport(name)
	// remove data on disk
	path := ResolveSharePath("", name, "")
	// try also to find exact share path if stored
	for _, s := range st.Shares {
		if s.Name == name && s.Path != "" {
			path = s.Path
			break
		}
	}
	if path != "" {
		_ = os.RemoveAll(path)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

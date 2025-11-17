package storage

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const poolFile = "/var/lib/labcore/pools.json"

type Pool struct {
	Name       string   `json:"name"`
	ParityDisk string   `json:"parity_disk"` // deprecated (for legacy UI)
	DataDisks  []string `json:"data_disks"`
	Layout     string   `json:"layout"` // stripe, mirror, raidz1, raidz2, raidz3
}

type PoolInfo struct {
	Pool
	TotalData  uint64   `json:"total_data"` // allocated capacity
	ParitySize uint64   `json:"parity_size"`
	Usable     uint64   `json:"usable"` // free
	Shares     []Share  `json:"shares"`
	Mounts     []string `json:"mounts"`
	Health     string   `json:"health"`
}

type poolState struct {
	Pools []Pool `json:"pools"`
}

func loadPools() (poolState, error) {
	st := poolState{}
	data, err := os.ReadFile(poolFile)
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

func savePools(st poolState) error {
	tmp := poolFile + ".tmp"
	if err := os.MkdirAll(filepath.Dir(poolFile), 0o755); err != nil {
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
	return os.Rename(tmp, poolFile)
}

// GET /api/storage/pools
func ListPools(w http.ResponseWriter, r *http.Request) {
	st, err := loadPools()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sharesState, _ := loadShares()

	info := buildZfsPoolInfo(st.Pools, sharesState.Shares)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// POST /api/storage/pools
func CreatePool(w http.ResponseWriter, r *http.Request) {
	var p Pool
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	if p.Layout == "" {
		p.Layout = "stripe"
	}
	// normalize /dev/ prefix
	if p.ParityDisk != "" && !strings.HasPrefix(p.ParityDisk, "/dev/") {
		p.ParityDisk = "/dev/" + p.ParityDisk
	}
	for i, d := range p.DataDisks {
		if d != "" && !strings.HasPrefix(d, "/dev/") {
			p.DataDisks[i] = "/dev/" + d
		}
	}
	if err := ValidatePoolDisks(p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(p.DataDisks) == 0 {
		http.Error(w, "Mindestens eine Data Disk erforderlich", http.StatusBadRequest)
		return
	}
	if err := ensureDisksFree(p.DataDisks); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	st, err := loadPools()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, existing := range st.Pools {
		if existing.Name == p.Name {
			http.Error(w, "Pool existiert bereits", http.StatusConflict)
			return
		}
	}

	if err := CreateZFSPool(p); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	st.Pools = append(st.Pools, p)
	if err := savePools(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

// DELETE /api/storage/pool/{name}
func DeletePool(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/storage/pool/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	st, err := loadPools()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	filtered := st.Pools[:0]
	var removed Pool
	for _, p := range st.Pools {
		if p.Name != name {
			filtered = append(filtered, p)
		} else {
			removed = p
		}
	}
	st.Pools = filtered
	if err := savePools(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	DestroyZFSPool(removed)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

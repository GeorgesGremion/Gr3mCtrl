package storage

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
)

type DiskInfo struct {
	Name       string     `json:"name"`
	Size       uint64     `json:"size"`
	Mountpoint string     `json:"mountpoint"`
	Type       string     `json:"type"`
	Model      string     `json:"model,omitempty"`
	Children   []DiskInfo `json:"children,omitempty"`
	Used       bool       `json:"used"`
}

// POST /api/storage/disk/format
// body: {"device":"/dev/sdb","force":false}
func FormatDisk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		Device string `json:"device"`
		Force  bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	dev := strings.TrimSpace(payload.Device)
	if !strings.HasPrefix(dev, "/dev/") || len(dev) < 6 {
		http.Error(w, "device erwartet (/dev/XYZ)", http.StatusBadRequest)
		return
	}

	disks, err := fetchDisks()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	disk, ok := findDisk(disks, strings.TrimPrefix(dev, "/dev/"))
	if !ok {
		http.Error(w, "Disk nicht gefunden", http.StatusNotFound)
		return
	}
	if disk.Used && !payload.Force {
		http.Error(w, "Disk ist gemountet oder belegt; Force nutzen, wenn sicher", http.StatusBadRequest)
		return
	}
	if err := formatDiskIfNeeded(dev); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "formatted", "device": dev})
}

// GET /api/storage/disks
func ListDisks(w http.ResponseWriter, r *http.Request) {
	disks, err := fetchDisks()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(disks)
}

// helper without HTTP - returns size map of top-level disks
func listDisksSimple() (map[string]uint64, error) {
	disks, err := fetchDisks()
	if err != nil {
		return nil, err
	}
	flat := flattenDisks(disks)
	res := make(map[string]uint64)
	for name, d := range flat {
		if d.Type != "disk" {
			continue
		}
		res[name] = d.Size
	}
	return res, nil
}

func extractDiskInfo(blk map[string]interface{}) DiskInfo {
	t, _ := blk["type"].(string)
	name, _ := blk["name"].(string)
	size := uint64(0)
	switch v := blk["size"].(type) {
	case string:
		if val, err := strconv.ParseUint(strings.TrimSpace(v), 10, 64); err == nil {
			size = val
		}
	case float64:
		size = uint64(v)
	}
	mp := ""
	if m, ok := blk["mountpoint"].(string); ok && m != "" {
		mp = m
	}
	model := ""
	if m, ok := blk["model"].(string); ok {
		model = strings.TrimSpace(m)
	}
	var children []DiskInfo
	used := mp != ""
	if subs, ok := blk["children"].([]interface{}); ok {
		for _, c := range subs {
			if childMap, ok := c.(map[string]interface{}); ok {
				child := extractDiskInfo(childMap)
				if child.Used {
					used = true
				}
				children = append(children, child)
			}
		}
	}
	return DiskInfo{
		Name:       name,
		Size:       size,
		Mountpoint: mp,
		Type:       t,
		Model:      model,
		Children:   children,
		Used:       used,
	}
}

// fetchDisks is shared between HTTP handler and internal checks to avoid double parsing.
func fetchDisks() ([]DiskInfo, error) {
	cmd := exec.Command("lsblk", "-J", "-b", "-o", "NAME,SIZE,MOUNTPOINT,TYPE,MODEL")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var parsed map[string][]map[string]interface{}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	var result []DiskInfo
	for _, blk := range parsed["blockdevices"] {
		info := extractDiskInfo(blk)
		if info.Type != "disk" {
			continue
		}
		result = append(result, info)
	}
	return result, nil
}

func flattenDisks(disks []DiskInfo) map[string]DiskInfo {
	res := make(map[string]DiskInfo)
	var walk func(d DiskInfo)
	walk = func(d DiskInfo) {
		res[d.Name] = d
		for _, c := range d.Children {
			walk(c)
		}
	}
	for _, d := range disks {
		walk(d)
	}
	return res
}

func findDisk(disks []DiskInfo, name string) (DiskInfo, bool) {
	for _, d := range disks {
		if d.Name == name {
			return d, true
		}
		if child, ok := findDisk(d.Children, name); ok {
			return child, true
		}
	}
	return DiskInfo{}, false
}

// firstMount returns the first mountpoint found in the disk tree (disk or its partitions)
func firstMount(d DiskInfo) string {
	if d.Mountpoint != "" {
		return d.Mountpoint
	}
	for _, c := range d.Children {
		if m := firstMount(c); m != "" {
			return m
		}
	}
	return ""
}

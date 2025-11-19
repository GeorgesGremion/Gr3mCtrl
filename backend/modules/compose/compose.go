package compose

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const stackBaseDirDefault = "/var/lib/gr3mctrl/stacks"

type StackInfo struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Services int    `json:"services"`
	Pool     string `json:"pool,omitempty"`
}

type createStackRequest struct {
	Name string `json:"name"`
	File string `json:"file"` // docker-compose.yml Inhalt (YAML)
	Pool string `json:"pool"`
}

type StackDetail struct {
	Name     string `json:"name"`
	File     string `json:"file"`
	Status   string `json:"status"`
	Services int    `json:"services"`
	Pool     string `json:"pool,omitempty"`
}

func ensureBaseDir(pool string) (string, error) {
	base := stackBaseDirDefault
	if pool != "" {
		base = filepath.Join("/mnt/gr3mctrl/pools", pool, "docker")
	}
	if err := os.MkdirAll(base, 0o755); err != nil {
		return "", err
	}
	return base, nil
}

func poolList() []string {
	data, err := os.ReadFile("/var/lib/gr3mctrl/pools.json")
	if err != nil || len(data) == 0 {
		return nil
	}
	type state struct {
		Pools []struct {
			Name string `json:"name"`
		} `json:"pools"`
	}
	var st state
	if err := json.Unmarshal(data, &st); err != nil {
		return nil
	}
	out := make([]string, 0, len(st.Pools))
	for _, p := range st.Pools {
		if strings.TrimSpace(p.Name) == "" {
			continue
		}
		out = append(out, p.Name)
	}
	return out
}

func findStack(name string) (base string, pool string, err error) {
	// default
	base, _ = ensureBaseDir("")
	if _, statErr := os.Stat(filepath.Join(base, name)); statErr == nil {
		return base, "", nil
	}
	for _, p := range poolList() {
		basePool, _ := ensureBaseDir(p)
		if _, statErr := os.Stat(filepath.Join(basePool, name)); statErr == nil {
			return basePool, p, nil
		}
	}
	return "", "", errors.New("Stack nicht gefunden")
}

// GET /api/compose/stacks
func ListStacks(w http.ResponseWriter, r *http.Request) {
	baseDefault, err := ensureBaseDir("")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type dirEntry struct {
		base string
		pool string
	}
	dirs := []dirEntry{{baseDefault, ""}}
	for _, p := range poolList() {
		if b, e := ensureBaseDir(p); e == nil {
			dirs = append(dirs, dirEntry{b, p})
		}
	}

	stacks := []StackInfo{}
	for _, d := range dirs {
		entries, err := os.ReadDir(d.base)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			status, services := composeStatus(d.base, name)
			stacks = append(stacks, StackInfo{Name: name, Status: status, Services: services, Pool: d.pool})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stacks)
}

// POST /api/compose/stacks
// Payload: { name, file }
func CreateStack(w http.ResponseWriter, r *http.Request) {
	var req createStackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Anfrage: "+err.Error(), http.StatusBadRequest)
		return
	}

	base, err := ensureBaseDir(req.Pool)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || strings.ContainsAny(req.Name, " /\\") {
		http.Error(w, "Stack-Name fehlt oder enthält unerlaubte Zeichen", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.File) == "" {
		http.Error(w, "docker-compose.yml Inhalt fehlt", http.StatusBadRequest)
		return
	}

	stackDir := filepath.Join(base, req.Name)
	if err := os.MkdirAll(stackDir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	composePath := filepath.Join(stackDir, "docker-compose.yml")
	if err := os.WriteFile(composePath, []byte(req.File), 0o644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved", "name": req.Name, "pool": req.Pool})
}

// GET /api/compose/stack/{name}
func GetStack(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/compose/stack/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Stack-Name fehlt", http.StatusBadRequest)
		return
	}

	base, pool, err := findStack(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	composePath := filepath.Join(base, name, "docker-compose.yml")
	data, err := os.ReadFile(composePath)
	if err != nil {
		http.Error(w, "Compose-File nicht gefunden", http.StatusNotFound)
		return
	}

	status, services := composeStatus(base, name)

	resp := StackDetail{
		Name:     name,
		File:     string(data),
		Status:   status,
		Services: services,
		Pool:     pool,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /api/compose/stack/{name}/env
func GetEnv(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/compose/stack/")
	name = strings.TrimSuffix(name, "/env")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Stack-Name fehlt", http.StatusBadRequest)
		return
	}

	base, _, err := findStack(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	stackDir := filepath.Join(base, name)
	envPath := filepath.Join(stackDir, ".env")
	_ = os.MkdirAll(stackDir, 0o755)

	data, err := os.ReadFile(envPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"env": string(data),
	})
}

// PUT /api/compose/stack/{name}/env
func SaveEnv(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/compose/stack/")
	name = strings.TrimSuffix(name, "/env")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Stack-Name fehlt", http.StatusBadRequest)
		return
	}

	base, _, err := findStack(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	stackDir := filepath.Join(base, name)
	if err := os.MkdirAll(stackDir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var payload map[string]string
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	envContent := payload["env"]

	envPath := filepath.Join(stackDir, ".env")
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// DELETE /api/compose/stack/{name}
func DeleteStack(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/compose/stack/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Stack-Name fehlt", http.StatusBadRequest)
		return
	}

	base, _, err := findStack(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	stackDir := filepath.Join(base, name)
	if _, err := os.Stat(stackDir); err != nil {
		http.Error(w, "Stack nicht gefunden", http.StatusNotFound)
		return
	}

	if err := os.RemoveAll(stackDir); err != nil {
		http.Error(w, "Konnte Stack nicht löschen: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

// POST /api/compose/stack/{name}/{action}
func StackAction(w http.ResponseWriter, r *http.Request) {
	action, name, err := parseActionPath(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	base, _, err := findStack(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	composePath := filepath.Join(base, name, "docker-compose.yml")
	if _, err := os.Stat(composePath); err != nil {
		http.Error(w, "Compose-File nicht gefunden", http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	args := []string{"compose", "-f", composePath}
	switch action {
	case "up":
		args = append(args, "up", "-d")
	case "down":
		args = append(args, "down")
	case "pull":
		args = append(args, "pull")
	default:
		http.Error(w, "unkannte Aktion", http.StatusBadRequest)
		return
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, string(output), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": string(output),
	})
}

func parseActionPath(path string) (action, name string, err error) {
	// /api/compose/stack/<name>/<action>
	parts := strings.Split(strings.TrimPrefix(path, "/api/compose/stack/"), "/")
	if len(parts) != 2 {
		return "", "", errors.New("Pfad erwartet /api/compose/stack/{name}/{action}")
	}
	name = parts[0]
	action = parts[1]
	if name == "" || action == "" {
		return "", "", errors.New("Name oder Aktion fehlt")
	}
	return action, name, nil
}

// composeStatus holt Service-Count und Status anhand von docker compose ps/config; robust gegen ältere CLI-Versionen.
func composeStatus(base, name string) (string, int) {
	composePath := filepath.Join(base, name, "docker-compose.yml")
	if _, err := os.Stat(composePath); err != nil {
		return "missing", 0
	}

	// Service-Count über "config --services"
	serviceCount := countServices(composePath)

	// Status via ps --format json (neu) oder Fallback plain
	status, running := psStatus(composePath)

	if status == "unknown" && serviceCount == 0 {
		return "unknown", 0
	}
	if status == "unknown" {
		// infer from running count
		switch {
		case running == serviceCount && serviceCount > 0:
			status = "running"
		case running > 0:
			status = "partial"
		default:
			status = "stopped"
		}
	}

	return status, serviceCount
}

func countServices(composePath string) int {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "config", "--services")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	count := 0
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		if strings.TrimSpace(sc.Text()) != "" {
			count++
		}
	}
	return count
}

func psStatus(composePath string) (string, int) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	// Try JSON first
	cmdJSON := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "ps", "--format", "json")
	if out, err := cmdJSON.Output(); err == nil {
		var services []map[string]any
		if err := json.Unmarshal(out, &services); err == nil {
			running := 0
			for _, s := range services {
				if state, ok := s["State"].(string); ok && strings.ToLower(state) == "running" {
					running++
				}
			}
			switch {
			case len(services) == 0:
				return "empty", 0
			case running == len(services):
				return "running", running
			case running > 0:
				return "partial", running
			default:
				return "stopped", running
			}
		}
	}

	// Fallback: plain format
	cmdPlain := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "ps", "--format", "{{.Service}}|{{.State}}")
	outPlain, err := cmdPlain.Output()
	if err != nil {
		return "unknown", 0
	}

	running := 0
	total := 0
	sc := bufio.NewScanner(strings.NewReader(string(outPlain)))
	for sc.Scan() {
		line := sc.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		total++
		parts := strings.Split(line, "|")
		if len(parts) >= 2 {
			if strings.Contains(strings.ToLower(parts[1]), "running") || strings.Contains(strings.ToLower(parts[1]), "up") {
				running++
			}
		}
	}

	switch {
	case total == 0:
		return "empty", 0
	case running == total:
		return "running", running
	case running > 0:
		return "partial", running
	default:
		return "stopped", running
	}
}

// derive pool name from base path (/mnt/gr3mctrl/pools/<pool>/docker or default)
func poolFromPath(base string) string {
	if strings.HasPrefix(base, "/mnt/gr3mctrl/pools/") {
		parts := strings.Split(base, "/")
		if len(parts) > 4 {
			return parts[4]
		}
	}
	return ""
}

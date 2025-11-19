package compose

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const templateDir = "/var/lib/gr3mctrl/templates"

type Template struct {
	Name string `json:"name"`
	File string `json:"file"`
}

func ensureTemplateDir() error {
	return os.MkdirAll(templateDir, 0o755)
}

// GET /api/compose/templates
func ListTemplates(w http.ResponseWriter, r *http.Request) {
	if err := ensureTemplateDir(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	entries, err := os.ReadDir(templateDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items := make([]Template, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		content, err := os.ReadFile(filepath.Join(templateDir, name))
		if err != nil {
			continue
		}
		items = append(items, Template{
			Name: strings.TrimSuffix(name, ".yml"),
			File: string(content),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// POST /api/compose/templates
func SaveTemplate(w http.ResponseWriter, r *http.Request) {
	if err := ensureTemplateDir(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var tpl Template
	if err := json.NewDecoder(r.Body).Decode(&tpl); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	tpl.Name = strings.TrimSpace(tpl.Name)
	if tpl.Name == "" || strings.ContainsAny(tpl.Name, " /\\") {
		http.Error(w, "Template-Name fehlt oder enthält ungültige Zeichen", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(tpl.File) == "" {
		http.Error(w, "Template-Inhalt fehlt", http.StatusBadRequest)
		return
	}

	path := filepath.Join(templateDir, tpl.Name+".yml")
	if err := os.WriteFile(path, []byte(tpl.File), 0o644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "saved",
		"name":   tpl.Name,
	})
}

// DELETE /api/compose/template/{name}
func DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	if err := ensureTemplateDir(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/compose/template/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}
	path := filepath.Join(templateDir, name+".yml")
	if err := os.Remove(path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "deleted",
		"name":   name,
	})
}

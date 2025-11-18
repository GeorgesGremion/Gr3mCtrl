package storage

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"
)

type ServiceStatus struct {
	Name    string `json:"name"`
	Running bool   `json:"running"`
	Message string `json:"message,omitempty"`
}

// HandleServiceStatus returns running state of the given systemd unit.
func HandleServiceStatus(w http.ResponseWriter, r *http.Request, unit string) {
	status := getServiceStatus(unit)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// HandleServiceAction starts or stops the given unit. Body: {"action":"start"|\"stop\"}
func HandleServiceAction(w http.ResponseWriter, r *http.Request, unit string) {
	var payload struct {
		Action string `json:"action"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payload)
	switch strings.ToLower(strings.TrimSpace(payload.Action)) {
	case "start":
		if err := startService(unit); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "stop":
		if err := stopService(unit); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.Error(w, "action must be start or stop", http.StatusBadRequest)
		return
	}
	status := getServiceStatus(unit)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func getServiceStatus(name string) ServiceStatus {
	cmd := exec.Command("systemctl", "is-active", name)
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	status := strings.TrimSpace(out.String())
	return ServiceStatus{
		Name:    name,
		Running: err == nil && status == "active",
		Message: status,
	}
}

func startService(name string) error {
	return exec.Command("systemctl", "start", name).Run()
}

func stopService(name string) error {
	return exec.Command("systemctl", "stop", name).Run()
}

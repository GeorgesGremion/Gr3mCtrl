package system

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
)

var allowedServices = map[string]bool{
	"gr3mctrl-backend.service": true,
	"gr3mctrl-gateway.service": true,
	"docker.service":           true,
	"libvirtd.service":         true,
}

func scheduleRestart(service string) error {
	// schedule restart in 1s via systemd-run to avoid killing current process before response
	cmd := exec.Command("systemd-run", "--unit", "gr3mctrl-restart-"+strings.ReplaceAll(service, ".service", ""), "--on-active=1", "systemctl", "restart", service)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// POST /api/system/service/restart {service:"gr3mctrl-backend.service"}
func RestartService(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Service string `json:"service"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	svc := strings.TrimSpace(req.Service)
	if !allowedServices[svc] {
		http.Error(w, "service not allowed", http.StatusBadRequest)
		return
	}

	if err := scheduleRestart(svc); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": svc})
}

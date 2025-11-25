package system

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"
)

var allowedServices = map[string]bool{
	"gr3mctrl-backend.service": true,
	"gr3mctrl-gateway.service": true,
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
	cmd := exec.Command("systemctl", "restart", svc)
	if out, err := cmd.CombinedOutput(); err != nil {
		http.Error(w, string(out)+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": svc})
}

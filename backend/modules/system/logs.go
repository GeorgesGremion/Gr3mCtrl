package system

import (
	"net/http"
	"os/exec"
	"strings"
)

// GET /api/system/logs?service=gr3mctrl-backend.service
func GetLogs(w http.ResponseWriter, r *http.Request) {
	svc := strings.TrimSpace(r.URL.Query().Get("service"))
	if !allowedServices[svc] {
		http.Error(w, "service not allowed", http.StatusBadRequest)
		return
	}
	cmd := exec.Command("journalctl", "-u", svc, "-n", "300", "--no-pager")
	out, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, string(out)+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(out)
}

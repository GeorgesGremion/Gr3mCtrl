package system

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
)

const updateScript = "/opt/gr3mctrl/bin/update.sh"

func CheckUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	out, err := exec.Command(updateScript, "check").Output()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write(out)
}

func ApplyUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	cmd := exec.Command("systemd-run", "--unit", "gr3mctrl-update", "--same-dir", "--quiet", updateScript, "apply")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "started",
		"message": "Update wird im Hintergrund ausgeführt – bitte kurz warten und anschließend erneut prüfen.",
	})
}

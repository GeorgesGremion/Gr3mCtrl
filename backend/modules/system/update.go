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
	cmd := exec.Command(updateScript, "apply")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	go cmd.Wait()
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "started",
		"message": "Update gestartet – bitte kurz warten und anschließend erneut prüfen.",
	})
}

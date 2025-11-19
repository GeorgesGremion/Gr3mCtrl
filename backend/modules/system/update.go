package system

import (
	"net/http"
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
	out, err := exec.Command(updateScript, "apply").CombinedOutput()
	if err != nil {
		http.Error(w, string(out), http.StatusInternalServerError)
		return
	}
	w.Write(out)
}

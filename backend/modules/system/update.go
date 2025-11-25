package system

import (
	"bufio"
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
	// Optional streaming mode
	if r.URL.Query().Get("stream") == "1" {
		w.Header().Set("Content-Type", "text/plain")
		f, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming nicht unterstützt", http.StatusInternalServerError)
			return
		}
		cmd := exec.Command("bash", "-lc", updateScript+" apply 2>&1")
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := cmd.Start(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			_, _ = w.Write(append(scanner.Bytes(), '\n'))
			f.Flush()
		}
		_ = cmd.Wait()
		_, _ = w.Write([]byte("\nUPDATE OK\n"))
		f.Flush()
		return
	}

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

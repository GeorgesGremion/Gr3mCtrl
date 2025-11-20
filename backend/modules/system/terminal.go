package system

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

type resizeMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

var shellUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ShellWS exposes a PTY-backed shell over WebSocket.
// Only expose this behind trusted auth and localhost gateway.
func ShellWS(w http.ResponseWriter, r *http.Request) {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip := net.ParseIP(host); ip != nil && !ip.IsLoopback() {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	secret := strings.TrimSpace(os.Getenv("GR3MCTRL_SHELL_SECRET"))
	if secret != "" {
		if hdr := r.Header.Get("X-Gr3mctrl-Shell-Secret"); hdr != secret {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}
	conn, err := shellUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("shell upgrade error: %v", err)
		return
	}
	defer conn.Close()

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("pty start error: %v", err)
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Failed to start shell\r\n"))
		return
	}
	defer func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
	}()

	_ = pty.Setsize(ptmx, &pty.Winsize{Cols: 120, Rows: 32})

	// PTY -> WS
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}
			if n > 0 {
				_ = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
		}
	}()

	conn.SetReadLimit(65536)
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))

	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))

		// Handle resize events
		if msgType == websocket.TextMessage && len(data) > 0 && data[0] == '{' {
			var rm resizeMsg
			if json.Unmarshal(data, &rm) == nil && rm.Type == "resize" && rm.Cols > 0 && rm.Rows > 0 {
				_ = pty.Setsize(ptmx, &pty.Winsize{Cols: rm.Cols, Rows: rm.Rows})
				continue
			}
		}

		if len(data) > 0 {
			if _, err := ptmx.Write(data); err != nil {
				return
			}
		}
	}
}

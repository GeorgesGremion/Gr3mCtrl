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

	"crypto/subtle"
	"github.com/creack/pty"
	"github.com/gorilla/websocket"
	"net/url"
)

type resizeMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

var shellUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		originHost := strings.ToLower(u.Hostname())
		if originHost == "" {
			return false
		}
		// Allow same host and local development origins only.
		host := strings.ToLower(r.Host)
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if originHost == host || originHost == "localhost" || originHost == "127.0.0.1" || originHost == "::1" {
			return true
		}
		return false
	},
}

func clientIP(r *http.Request) net.IP {
	if xff := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); xff != "" {
		if ip := net.ParseIP(xff); ip != nil {
			return ip
		}
	}
	if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); xr != "" {
		if ip := net.ParseIP(xr); ip != nil {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return nil
	}
	return net.ParseIP(host)
}

func providedSecret(r *http.Request) string {
	if hdr := strings.TrimSpace(r.Header.Get("X-Gr3mctrl-Shell-Secret")); hdr != "" {
		return hdr
	}
	if q := strings.TrimSpace(r.URL.Query().Get("secret")); q != "" {
		return q
	}
	if c, err := r.Cookie("gr3mctrl_shell_secret"); err == nil {
		if v := strings.TrimSpace(c.Value); v != "" {
			return v
		}
	}
	return ""
}

// ShellWS exposes a PTY-backed shell over WebSocket.
// Only expose this behind trusted auth and localhost gateway.
func ShellWS(w http.ResponseWriter, r *http.Request) {
	client := clientIP(r)
	isLocal := client != nil && client.IsLoopback()

	envSecret := strings.TrimSpace(os.Getenv("GR3MCTRL_SHELL_SECRET"))
	given := providedSecret(r)

	// Harden remote access: block non-local clients unless a secret is set and provided.
	if !isLocal && envSecret == "" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if envSecret != "" {
		if subtle.ConstantTimeCompare([]byte(envSecret), []byte(given)) != 1 {
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

package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	listenAddr := getenv("GR3MCTRL_GATEWAY_ADDR", ":4173")
	backendURL := getenv("GR3MCTRL_BACKEND_URL", "http://127.0.0.1:8080")
	distDir := getenv("GR3MCTRL_FRONTEND_DIST", "/opt/gr3mctrl/frontend/dist")

	target, err := url.Parse(backendURL)
	if err != nil {
		log.Fatalf("Ungültige Backend-URL %s: %v", backendURL, err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorLog = log.New(os.Stderr, "proxy: ", log.LstdFlags)

	mux := http.NewServeMux()
	mux.Handle("/api/", proxy)
	mux.Handle("/ws", proxy)
	mux.Handle("/ws/", proxy)
	mux.HandleFunc("/", spaHandler(distDir))

	log.Printf("gr3mctrl Gateway lauscht auf %s (Backend %s, Dist %s)\n", listenAddr, backendURL, distDir)
	
	// Custom server with increased limits for ISO uploads (10GB max)
	server := &http.Server{
		Addr:           listenAddr,
		Handler:        withSecurityHeaders(mux),
		MaxHeaderBytes: 1 << 20, // 1 MB
		// No ReadTimeout/WriteTimeout to allow large uploads
	}
	
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func spaHandler(dist string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cleanPath := filepath.Clean("/" + r.URL.Path)
		if cleanPath == "/" {
			http.ServeFile(w, r, filepath.Join(dist, "index.html"))
			return
		}
		full := filepath.Join(dist, strings.TrimPrefix(cleanPath, "/"))
		if info, err := os.Stat(full); err == nil && !info.IsDir() {
			http.ServeFile(w, r, full)
			return
		}
		http.ServeFile(w, r, filepath.Join(dist, "index.html"))
	}
}

func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		next.ServeHTTP(w, r)
	})
}

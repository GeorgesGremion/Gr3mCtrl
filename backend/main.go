package main

import (
	"gr3mctrl/api"
	"log"
	"net/http"
	"os"
)

func main() {
	api.RegisterRoutes()

	addr := os.Getenv("GR3MCTRL_BACKEND_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}

	log.Printf("gr3mctrl Backend lauscht auf %s (nur lokal erreichbar)\n", addr)
	
	// Custom server with no body size limits for large uploads
	server := &http.Server{
		Addr:           addr,
		Handler:        nil, // use DefaultServeMux
		MaxHeaderBytes: 1 << 20, // 1 MB
		// No ReadTimeout/WriteTimeout to allow large uploads
	}
	
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

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
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

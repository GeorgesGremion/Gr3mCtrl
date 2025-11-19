package main

import (
	"gr3mctrl/api"
	"log"
	"net/http"
)

func main() {

	// API-Routen registrieren
	api.RegisterRoutes()

	log.Println("gr3mctrl Backend läuft auf Port 8080...")
	err := http.ListenAndServe(":8080", nil)

	if err != nil {
		log.Fatal(err)
	}
}

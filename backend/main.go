package main

import (
	"ggithub/api"
	"log"
	"net/http"
)

func main() {

	// API-Routen registrieren
	api.RegisterRoutes()

	log.Println("GGITHub Backend läuft auf Port 8080...")
	err := http.ListenAndServe(":8080", nil)

	if err != nil {
		log.Fatal(err)
	}
}

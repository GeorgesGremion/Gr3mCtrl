package main

import (
	"c0r3nex/api"
	"log"
	"net/http"
)

func main() {

	// API-Routen registrieren
	api.RegisterRoutes()

	log.Println("C0R3NEX Backend läuft auf Port 8080...")
	err := http.ListenAndServe(":8080", nil)

	if err != nil {
		log.Fatal(err)
	}
}

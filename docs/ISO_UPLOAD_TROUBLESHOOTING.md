# ISO Upload Troubleshooting

## Problem: HTTP 413 Request Entity Too Large

Der Fehler tritt auf, wenn ISO-Dateien hochgeladen werden sollen, die größer als das Standard-Upload-Limit sind.

### Lösung: Automatisches Update (empfohlen)

Die Upload-Limits wurden in v0.1.1 entfernt. Das automatische Update über das Web-Frontend sollte:

1. Die Services stoppen
2. Die neueste Version vom Branch holen
3. Backend **und** Gateway neu kompilieren
4. `systemctl daemon-reload` ausführen
5. Services mit `systemctl restart` neu starten
6. Verifizieren, dass beide Services laufen

**Nach dem automatischen Update** (über System → Version → "Update installieren"):
- Die Services werden automatisch neu gestartet
- Die neuen Binärdateien mit entfernten Upload-Limits sind aktiv
- ISO-Uploads jeder Größe sollten funktionieren

### Logs überprüfen

Wenn das automatische Update fehlschlägt oder der Upload noch nicht funktioniert:

```bash
# Update-Logs anschauen
sudo journalctl -u gr3mctrl-backend -n 50 --no-pager
sudo journalctl -u gr3mctrl-gateway -n 50 --no-pager

# Prüfen ob Services laufen
sudo systemctl status gr3mctrl-backend gr3mctrl-gateway

# Prüfen wann die Binärdateien zuletzt gebaut wurden
ls -lah /usr/local/bin/gr3mctrl-*
```

### Manuelle Intervention (nur falls automatisches Update fehlschlägt)

Falls das automatische Update nicht funktioniert:

```bash
# Direkt das Update-Script aufrufen
sudo /opt/gr3mctrl/bin/update.sh apply

# Oder manuell:
cd /opt/gr3mctrl
sudo git pull origin v0.1.1
cd backend
sudo go build -o /usr/local/bin/gr3mctrl-backend ./main.go
sudo go build -o /usr/local/bin/gr3mctrl-gateway ./cmd/gateway/main.go
sudo systemctl daemon-reload
sudo systemctl restart gr3mctrl-backend gr3mctrl-gateway
```

### Externe Reverse-Proxy prüfen

**Hinweis:** Standardmäßig wird **kein** nginx/apache installiert. Der Gateway läuft direkt auf Port 4173.

Falls du **zusätzlich** einen nginx/apache davor hast, musst du dort auch die Limits erhöhen:

**Nginx:**
```nginx
client_max_body_size 10G;  # In http{} oder server{} Block
```

**Apache:**
```apache
LimitRequestBody 10737418240  # 10GB in Bytes
```

## Technische Details

Die Änderungen umfassen:
- `backend/main.go`: Custom `http.Server` ohne ReadTimeout/WriteTimeout
- `backend/cmd/gateway/main.go`: Custom `http.Server` ohne ReadTimeout/WriteTimeout  
- `backend/modules/storage/isos.go`: `ParseMultipartForm(100<<20)` für effizientes Streaming
- `scripts/update.sh`: Verbesserter Service-Neustart mit `daemon-reload`

Diese Konfigurationen erlauben ISO-Uploads beliebiger Größe, da:
1. Keine Body-Size-Limits gesetzt werden
2. Keine Timeouts den Upload abbrechen
3. Dateien >100MB direkt gestreamt werden (nicht im RAM gepuffert)
4. Services nach Update garantiert neu gestartet werden


# ISO Upload Troubleshooting

## Problem: HTTP 413 Request Entity Too Large

Der Fehler tritt auf, wenn ISO-Dateien hochgeladen werden sollen, die größer als das Standard-Upload-Limit sind.

### Lösung

Die Upload-Limits wurden in v0.1.1 (nach Commit d6d72ba) entfernt. Um sicherzustellen, dass die Änderungen aktiv sind:

#### 1. Manuelle Überprüfung

```bash
# Überprüfe die Service-Version
systemctl status gr3mctrl-backend gr3mctrl-gateway

# Prüfe, wann die Binärdateien gebaut wurden
ls -lah /usr/local/bin/gr3mctrl-*

# Datum sollte NACH dem letzten Update sein
```

#### 2. Manueller Neustart (falls nötig)

```bash
# Stoppe beide Services
sudo systemctl stop gr3mctrl-backend gr3mctrl-gateway

# Gehe zum Projektverzeichnis
cd /opt/gr3mctrl

# Hole die neueste Version
sudo git pull origin v0.1.1

# Baue Backend neu
cd backend
sudo go build -o /usr/local/bin/gr3mctrl-backend ./main.go
sudo go build -o /usr/local/bin/gr3mctrl-gateway ./cmd/gateway/main.go

# Baue Frontend neu (optional, nur wenn UI-Änderungen)
cd ../frontend
sudo npm install
sudo npm run build

# Starte Services neu
sudo systemctl start gr3mctrl-backend
sudo systemctl start gr3mctrl-gateway

# Überprüfe Status
sudo systemctl status gr3mctrl-backend gr3mctrl-gateway
```

#### 3. Logs überprüfen

```bash
# Backend-Logs
sudo journalctl -u gr3mctrl-backend -n 50 --no-pager

# Gateway-Logs
sudo journalctl -u gr3mctrl-gateway -n 50 --no-pager
```

#### 4. Externe Reverse-Proxy prüfen

Falls du einen nginx/apache davor hast, musst du dort auch die Limits erhöhen:

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

Diese Konfigurationen erlauben ISO-Uploads beliebiger Größe, da:
1. Keine Body-Size-Limits gesetzt werden
2. Keine Timeouts den Upload abbrechen
3. Dateien >100MB direkt gestreamt werden (nicht im RAM gepuffert)

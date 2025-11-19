# Gr3mCtrl

Gr3mCtrl ist die zentrale Steuereinheit für dein Homelab – inspiriert von Proxmox, Portainer und TrueNAS, aber komplett in Go/React entwickelt. Ein integrierter Installer richtet Backend, Frontend-Gateway und alle Dienste auf einem frischen Ubuntu-Host ein.

- **Backend**: Go (`net/http`) mit Modulen für Docker, Compose, libvirt/KVM, ZFS, Samba/NFS, NAS-Userverwaltung.
- **Frontend**: React + Vite + Tailwind + React Query; Dark-UI im GGIT-Stil.
- **Gateway**: Go-Reverse-Proxy, der das statische Frontend ausliefert und `/api`/`/ws` sicher an das Backend auf `127.0.0.1` weiterleitet.

---

## Features im Überblick

| Bereich | Funktionen |
| --- | --- |
| **Storage** | ZFS-Pools (stripe/mirror/raidz*), SMB/NFS-Shares, NAS-User inkl. Samba-Integration, automatische Samba-Konfiguration |
| **Docker** | Container/Images/Networks, Compose-Stacks (mit separaten Stack-Verzeichnissen `/mnt/gr3mctrl/pools/<pool>/docker/<stack>`), Logs, Aktionen |
| **VMs** | Libvirt/KVM, ISO-Library, VM-Listen mit Tabs (Hardware/Netzwerk/Console), integrierter noVNC |
| **System** | Dashboard, Ressourcennutzung, Dienste-Steuerung (SMB/NFS), Pools & Laufwerke verwalten, Update-Check & One-Click-Upgrade |
| **Installer** | `curl ... | bash` installiert Abhängigkeiten, klont Repo nach `/opt/gr3mctrl`, baut Backend/Gateway/Frontend, richtet systemd-Services + Samba-Include ein |

Alle Pfade liegen konsistent unter:
- `/opt/gr3mctrl` – Quellcode + Installer + VERSION-Datei
- `/var/lib/gr3mctrl` – Persistente Daten
- `/mnt/gr3mctrl/pools/<pool>` – ZFS-Pools (shares, vm, docker, stacks, etc.)

---

## Installation (Produktiv)

```bash
curl -fsSL https://raw.githubusercontent.com/GeorgesGremion/Gr3mCtrl/v0.1.0/installer/install.sh | sudo bash
```

Der Installer übernimmt:
1. System-Pakete (Docker, libvirt, ZFS, Node 22, Go, Samba/NFS, rsync, etc.)
2. Git-Clone nach `/opt/gr3mctrl` + Versionsdatei (`VERSION`, `BRANCH`)
3. Go-Build für Backend (`/usr/local/bin/gr3mctrl-backend`) + Gateway (`/usr/local/bin/gr3mctrl-gateway`)
4. `npm install && npm run build` für das Frontend (`frontend/dist`)
5. Deployment der systemd-Services:
   - `gr3mctrl-backend.service` → lauscht ausschließlich auf `127.0.0.1:8080`
   - `gr3mctrl-gateway.service` → liefert Frontend (Port 4173) + Reverse Proxy auf das Backend
6. Samba-Include `/etc/samba/gr3mctrl-shares.conf` + Reload

Nach der Installation erreichst du das UI unter `http://<dein-host>:4173`.

### Updates

Gr3mCtrl bringt ein CLI-/API-gesteuertes Update-Tool:

```bash
/opt/gr3mctrl/bin/update.sh check   # zeigt verfügbares Update
/opt/gr3mctrl/bin/update.sh apply   # stoppt Services, pullt Repo, baut neu, startet Services
```

In der UI (System → Version) erscheint automatisch ein Banner, wenn neue Commits im konfigurierten Branch (`/opt/gr3mctrl/BRANCH`, standard `v0.1.0`) verfügbar sind.

---

## Entwicklung & lokale Umgebung

```bash
# Backend
cd backend
go run .

# Frontend
cd ../frontend
npm install
npm run dev -- --host
```

Der Dev-Server proxyt `/api` nach `http://127.0.0.1:8080`. Falls du ein anderes Backend verwendest, setze `VITE_PROXY_TARGET` in `.env`.

---

## Projektstruktur

```
backend/            Go-API + Module + cmd/gateway
frontend/           React/Vite-Frontend
installer/          Installationsskripte
scripts/update.sh   CLI zum Prüfen/Installieren von Updates
docs/               Architektur-Blueprint, Roadmaps, Guides
```

Siehe `docs/gr3mctrl-blueprint.md` für die langfristige Roadmap.

---

## Lizenz / Nutzung

Noch nicht final festgelegt. Aktuell nur private Nutzung. Für produktive oder kommerzielle Szenarien bitte zuerst Freigabe einholen.***

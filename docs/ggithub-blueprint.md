# GGITHub Blueprint – Next Milestone

## 1. Produktvision

Ein einziger Control-Plane-Server auf Ubuntu, der

- Docker-Container **und** Docker-Compose-Stacks verwaltet,
- KVM/Libvirt-VMs (später optional Proxmox/LXC) orchestriert,
- Netzwerke (Docker + virtuelle Bridges/VLANs) konsistent pflegt,
- Storage & ISO-Bibliotheken bereitstellt,
- ein modernes, responsives UI mit „GGIT.ch“-ähnlichem Premium-Look liefert.

Alle Dienste laufen lokal, spätere Multi-Host-Erweiterungen können über den bestehenden `agent`-Gedanken ergänzt werden.

## 2. Backend-Architektur

### 2.1 Services & Module

| Modul               | Aufgabe                                                                                       |
|---------------------|------------------------------------------------------------------------------------------------|
| `api`               | HTTP-Gateway (Go `net/http`), verantwortet Routing, Auth (später), Reverse Proxy/WebSocket.    |
| `modules/docker`    | Container, Images, Stats, neue Compose-Verwaltung, Netzwerk-Actions.                           |
| `modules/vm`        | Libvirt-Client (über `libvirt.org/go`), VM-CRUD, Snapshots, ISO-Attach, Virt-Netzwerke.        |
| `modules/storage`   | ISO-/Image-Repository, Upload/Checksum, Storage-Pools (libvirt), Volume-Aktionen.              |
| `modules/network`   | Abstraktion über Docker-Netze + Libvirt-Netze (Bridge/VLAN), DHCP/Zuweisungen.                 |
| `modules/compose`   | Wrapper um `docker compose` (CLI) oder SDK, Stack-Verzeichnis `/<data>/stacks/<name>`.         |
| `modules/system`    | Host-Infos, Health, Ressourcen-Limits.                                                         |

Persistente Daten / Artefakte:

- `/var/lib/ggithub/config.json` (globale Settings)
- `/var/lib/ggithub/stacks/<stack>/docker-compose.yml`
- `/var/lib/ggithub/isos/<file>.iso`
- `/var/lib/ggithub/templates/<vm>.json`
- `/var/lib/ggithub/state.db` (BoltDB oder LiteFS für Metadaten)

### 2.2 Docker & Compose

- **Container**: bleibt wie heute, ergänzt `exec`, `inspect`, Live-logs streaming.
- **Compose**:
  - POST `/api/compose/stacks` (name, file, env)
  - GET `/api/compose/stacks` → list + status (up/down, services, replicas)
  - POST `/api/compose/stacks/:name/up|down|pull`
  - GET `/api/compose/stacks/:name/logs?service=foo`
  - Implementation: `docker compose` CLI via Go exec (mit Kontext `cwd = stack dir`) oder über `github.com/docker/compose/v2/pkg/api`.

### 2.3 VM-Orchestrator

- Provider 1: **Libvirt/KVM** (Ubuntu Standard)
  - Verwendet `libvirt.org/go/libvirt` → Domain-Definitionen aus XML-Templates.
  - Features Phase 1:
    - List/Create/Delete/Clone
    - Start/Stop/Reboot
    - Attach ISO & Boot Order
    - VirtIO Disk/Net Device
    - Snapshot list/create/revert
  - Datenmodell (JSON):
    ```jsonc
    {
      "id": "vm-uuid",
      "name": "homeassistant",
      "state": "running",
      "vcpus": 2,
      "memory_mb": 4096,
      "disks": [{ "path": "/var/lib/libvirt/images/ha.qcow2", "size_gb": 32 }],
      "networks": [{ "network": "br-lab", "mac": "52:54:..." }],
      "isos": ["ubuntu-24.04.iso"]
    }
    ```

### 2.4 Netzwerk-Matrix

1. **Docker-Networks** (fertig, später: connect/disconnect Container).
2. **Virtuelle Netze** (Libvirt):
   - Bridges (`virsh net-*`) + VLAN/Gateway.
   - API:
     - GET `/api/networks/virtual` + details (DHCP range, forward-mode).
     - POST `/api/networks/virtual` (name, cidr, bridge, dns).
     - Actions: start/stop, attach VM NIC.
3. **Physische Interfaces**:
   - Read-only Infos aus `ip addr`, `nmcli`.
   - Vorbereitung für späteres Bonding/VLAN.

### 2.5 Storage & ISO

- Storage Pools (libvirt) + LVM/Dir Pools.
- Volume CRUD (qcow2, raw): `/api/storage/volumes`.
- ISO-Library:
  - Upload (multi-part) → `/var/lib/ggithub/isos`.
  - GET `/api/storage/isos` → metadata (size, checksum).
  - Action: `attach` (VM id, iso name).

## 3. API-Backlog (erste Iteration)

| Bereich        | Endpoint/Action                                  | Payload/Notizen                                                                 |
|----------------|--------------------------------------------------|---------------------------------------------------------------------------------|
| Settings       | `GET/PUT /api/settings`                          | Socket-Pfad, Default-Compose-Dir, Theme, Interval                              |
| Compose        | `GET /api/compose/stacks`                        | Liefert Array mit Status                                                       |
| Compose        | `POST /api/compose/stacks`                       | `{ name, file (base64), env }`                                                 |
| Compose        | `POST /api/compose/stacks/:name/:action`         | action ∈ {up, down, pull, restart}                                             |
| Compose        | `DELETE /api/compose/stacks/:name`               | Entfernt Verzeichnis + Status                                                  |
| VMs            | `GET /api/vm/domains`                            | Liste + Basic-Stats                                                            |
| VMs            | `POST /api/vm/domains`                           | `{ name, cpu, memory_mb, disk_gb, iso, network }`                              |
| VMs            | `POST /api/vm/domains/:id/:action`               | Start/Stop/Reboot/Snapshot                                                     |
| VMs            | `GET /api/vm/domains/:id/console` (WS)           | Für SPICE/VNC Proxy                                                            |
| Virt-Net       | `GET/POST/DELETE /api/networks/virtual`          | +/- DHCP, Forward-Mode                                                         |
| Storage        | `GET/POST /api/storage/isos`                     | Upload + Liste                                                                 |
| Storage        | `GET/POST /api/storage/volumes`                  | LVM/qcow-Verwaltung                                                            |
| Docker logs    | `GET /api/docker/container/:id/logs?follow=1`    | SSE/WebSocket-Streaming                                                        |
| Agents         | `POST /api/agents/register` (optional später)    | Multi-Host                               |

## 4. Frontend UX / UI-Konzept

### 4.1 Layout / Navigation

- **Shell**: Sidebar (sticky), Topbar (Breadcrumb + Aktionen), Content Area (max-width fluid, 12-spaltiges Grid).
- **Responsive**: ab 1280px -> 3 Spalten Panels; <1024px -> 2 Spalten; <768px -> Stack.
- **Navigation-Gruppen**:
  1. **Operations**: Dashboard, Containers, Compose, VMs.
  2. **Resources**: Images, ISOs, Networks, Volumes.
  3. **Admin**: System, Settings.
- Mobile Sidebar collapsible (slide-in).

### 4.2 Visual Design

- Farbwelt: Dunkles Theme mit weichen Violett-/Blau-Verläufen (ähnlich GGIT.ch), Highlights in Neon-Cyan.
- Hintergrund: gradient mesh + dezente Partikel (Canvas/SVG) → „Wow“-Effekt.
- Cards: Glassmorphism (rgba(17,25,40,0.65), blur backdrop, 1px border).
- Typographie: `Inter` oder `Space Grotesk` für Headlines; `Inter`/`IBM Plex Mono` für Zahlen.
- Icons: `lucide-react`.
- Animations: subtle spring transitions (Framer Motion) bei Cards, hover-lift, shimmering skeleton loader.

### 4.3 Komponenten

- **Dashboard**: hero metrics + sparkline, 3D-like cards, Compose/VM quick actions.
- **Tables**: sticky header, badge chips, inline actions.
- **Forms**: multi-step (z.B. VM Create Wizard).
- **Charts**: Recharts mit Gradients, area/line, radial gauges.
- **Log Viewer**: code editor look (monospace, colored severity), auto-scroll.

### 4.4 Responsive Guidelines

- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.
- Use CSS Grid + `clamp()` for typography.
- Keep action buttons accessible: primary actions always visible (floating bar on mobile).

## 5. Iterationsplan

1. **Sprint A – Compose Core**
   - Backend Compose-Endpunkte, persistente Stack-Verzeichnisse.
   - Frontend Compose-Seite (list, upload, up/down, logs).
2. **Sprint B – VM MVP**
   - Libvirt Client einbinden, VM-CRUD, ISO attach, Virt-Netz list/create.
   - UI: VM-Grid, Detail-Drawer mit stats + actions.
3. **Sprint C – Storage/ISO + Networks**
   - ISO Upload UI, ISO attach flows.
   - Virtuelle Netzwerke + Docker/VM cross-view.
4. **Sprint D – UI Polish**
   - Global Theme, Layout-Refactor, Motion, mobile breakpoints, log viewer, settings.

Dieses Dokument dient als Referenz, damit Backend- und Frontend-Arbeiten zielgerichtet umgesetzt werden können und das Endprodukt den gewünschten „WOW“-Effekt liefert.


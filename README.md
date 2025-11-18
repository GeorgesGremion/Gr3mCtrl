# C0R3NEX

Ein schlankes Homelab- und Bare-Metal-Manager inspiriert von Proxmox / Portainer / TrueNAS:
- **Backend:** Go (Docker API v1.28+, libvirt/KVM, ZFS, Samba/NFS)
- **Frontend:** React (Vite, Tailwind, React Query)
- **Features:** Docker-Container/Images/Networks/Compose, ZFS-Pools/Shares, ISO-Library, VM-Erstellung mit VNC-Konsole.

## Quickstart (Entwicklung)
```bash
# Backend
cd backend
go run .

# Frontend
cd ../frontend
npm install
npm run dev -- --host
```
Frontend erwartet den Backend-Port 8080 unter `/api/...`.

## Storage (ZFS-Pools)
- Pools werden als ZFS-Pool mit Layout stripe/mirror/raidz* angelegt.
- Pfade: `/mnt/c0r3nex/pools/<pool>/{vm,shares,isos,docker,...}`.
- ISOs können pro Pool hochgeladen werden (`/api/storage/isos?pool=<pool>`).

## Docker / Compose
- Stacks werden poolfähig unter `/mnt/c0r3nex/pools/<pool>/docker/<stack>/` gespeichert (compose.yml, .env).
- Volumes können auf Pools gebunden werden.

## VMs
- libvirt/KVM; Disks bei Pool-Wahl unter `/mnt/c0r3nex/pools/<pool>/vm/<name>/`.
- VNC-Console im Browser, On-Screen-Keyboard.

## Systemvoraussetzungen
- Ubuntu/Debian mit Docker & libvirt/KVM.
- ZFS (`zfsutils-linux`) für Pool-Funktionalität.
- Samba/NFS (optional) für Shares.

## Lizenz
Noch nicht festgelegt. Bis dahin: nur private Nutzung nach eigenem Ermessen.***

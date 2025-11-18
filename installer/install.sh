#!/usr/bin/env bash
set -euo pipefail

# GGITHub installer
# Achtung: benötigt root; installiert Prereqs, baut Backend/Frontend, richtet Systemd ein.

APP_USER="root"
APP_DIR="/opt/ggithub"
DATA_DIR="/var/lib/ggithub"
MNT_DIR="/mnt/ggithub"
BACKEND_BIN="$APP_DIR/backend/ggithub"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE_BACKEND="ggithub-backend.service"
SERVICE_FRONTEND="ggithub-frontend.service"

log() { echo "[ggithub-installer] $*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log "Bitte als root ausführen."; exit 1; fi
}

install_prereqs() {
  log "Installiere Prereqs..."
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates \
    docker.io docker-compose-plugin \
    qemu-kvm libvirt-daemon-system libvirt-clients \
    zfsutils-linux samba nfs-kernel-server \
    nodejs npm
}

create_layout() {
  log "Lege Verzeichnisse an..."
  mkdir -p "$APP_DIR/backend" "$APP_DIR/frontend" "$DATA_DIR" "$MNT_DIR"
}

build_backend() {
  log "Baue Backend..."
  pushd /root/ggithub/backend >/dev/null
  go build -o "$BACKEND_BIN"
  popd >/dev/null
}

build_frontend() {
  log "Baue Frontend..."
  pushd /root/ggithub/frontend >/dev/null
  npm install
  npm run build
  rsync -a dist/ "$FRONTEND_DIR/dist/"
  popd >/dev/null
}

write_services() {
  log "Schreibe systemd Units..."
  cat > /etc/systemd/system/$SERVICE_BACKEND <<EOF2
[Unit]
Description=GGITHub Backend Service
After=network.target docker.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
ExecStart=$BACKEND_BIN
Restart=always

[Install]
WantedBy=multi-user.target
EOF2

  cat > /etc/systemd/system/$SERVICE_FRONTEND <<EOF3
[Unit]
Description=GGITHub Frontend Service (static serve)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$FRONTEND_DIR
ExecStart=/usr/bin/env bash -lc "npx serve -s dist -l 4173"
Restart=always

[Install]
WantedBy=multi-user.target
EOF3
}

setup_samba_include() {
  local include="/etc/samba/ggithub-shares.conf"
  if [ ! -f "$include" ]; then
    echo "# GGITHub SMB Shares" > "$include"
  fi
  if ! grep -q "ggithub-shares.conf" /etc/samba/smb.conf; then
    echo "include = $include" >> /etc/samba/smb.conf
  fi
  systemctl reload smbd || true
}

reload_enable() {
  log "Aktiviere Dienste..."
  systemctl daemon-reload
  systemctl enable --now $SERVICE_BACKEND
  systemctl enable --now $SERVICE_FRONTEND
}

main() {
  require_root
  install_prereqs
  create_layout
  build_backend
  build_frontend
  write_services
  setup_samba_include
  reload_enable
  log "Fertig. Backend auf Port 8080, Frontend auf 4173."
}

main "$@"

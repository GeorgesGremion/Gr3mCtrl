#!/usr/bin/env bash
set -euo pipefail

# gr3mctrl Installer (frische Maschine)
APP_USER="root"
APP_DIR="/opt/gr3mctrl"
REPO_URL="https://github.com/GeorgesGremion/LabCore.git"
REPO_BRANCH="v0.1.0"
DATA_DIR="/var/lib/gr3mctrl"
MNT_DIR="/mnt/gr3mctrl"
BACKEND_BIN="/usr/local/bin/gr3mctrl"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE_BACKEND="gr3mctrl-backend.service"
SERVICE_FRONTEND="gr3mctrl-frontend.service"

log(){ echo "[gr3mctrl-installer] $*"; }
require_root(){ [ "$(id -u)" -eq 0 ] || { log "Bitte als root ausführen."; exit 1; }; }

install_prereqs(){
  log "Installiere Prereqs..."
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl git \
    qemu-system-x86 libvirt-daemon-system libvirt-clients libvirt-dev \
    zfsutils-linux samba nfs-kernel-server \
    nodejs npm golang pkg-config build-essential rsync

  # Docker aus dem offiziellen Repo inkl. compose v2 Plugin
  apt-get remove -y docker docker.io docker-doc docker-compose podman-docker containerd runc || true
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${UBUNTU_CODENAME:-$VERSION_CODENAME}\") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

clone_repo(){
  log "Hole Repository..."
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch --all
    git -C "$APP_DIR" checkout "$REPO_BRANCH" || true
    git -C "$APP_DIR" pull --ff-only origin "$REPO_BRANCH" || true
  else
    rm -rf "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
    git -C "$APP_DIR" checkout "$REPO_BRANCH" || true
  fi
}

create_layout(){
  log "Lege Verzeichnisse an..."
  mkdir -p "$DATA_DIR" "$MNT_DIR"
}

build_backend(){
  log "Baue Backend..."
  pushd "$APP_DIR/backend" >/dev/null
  go build -o "$BACKEND_BIN"
  popd >/dev/null
}

build_frontend(){
  log "Baue Frontend..."
  pushd "$APP_DIR/frontend" >/dev/null
  npm install
  npm run build
  mkdir -p "$FRONTEND_DIR/dist"
  rsync -a dist/ "$FRONTEND_DIR/dist/"
  popd >/dev/null
}

write_services(){
  log "Schreibe systemd Units..."
  cat > /etc/systemd/system/$SERVICE_BACKEND <<EOF2
[Unit]
Description=gr3mctrl Backend Service
After=network.target docker.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
ExecStartPre=/usr/bin/env bash -lc 'cd $APP_DIR/backend && go build -o $BACKEND_BIN ./main.go'
ExecStart=$BACKEND_BIN
Restart=always

[Install]
WantedBy=multi-user.target
EOF2

  cat > /etc/systemd/system/$SERVICE_FRONTEND <<EOF3
[Unit]
Description=gr3mctrl Frontend Service (static serve)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$FRONTEND_DIR
ExecStartPre=/usr/bin/env bash -lc 'cd $FRONTEND_DIR && npm install && npm run build'
ExecStart=/usr/bin/env bash -lc 'cd $FRONTEND_DIR && npm run preview -- --host 0.0.0.0 --port 4173'
Restart=always

[Install]
WantedBy=multi-user.target
EOF3
}

setup_samba_include(){
  local include="/etc/samba/gr3mctrl-shares.conf"
  [ -f "$include" ] || echo "# gr3mctrl SMB Shares" > "$include"
  grep -q "gr3mctrl-shares.conf" /etc/samba/smb.conf || echo "include = $include" >> /etc/samba/smb.conf
  systemctl reload smbd || true
}

reload_enable(){
  log "Aktiviere Dienste..."
  systemctl daemon-reload
  systemctl enable --now $SERVICE_BACKEND
  systemctl enable --now $SERVICE_FRONTEND
}

main(){
  require_root
  install_prereqs
  clone_repo
  create_layout
  build_backend
  build_frontend
  write_services
  setup_samba_include
  reload_enable
  log "Fertig. Backend auf Port 8080, Frontend auf 4173."
}

main "$@"

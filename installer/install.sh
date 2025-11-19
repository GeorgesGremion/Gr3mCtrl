#!/usr/bin/env bash
set -euo pipefail

# gr3mctrl Installer (frische Maschine)
APP_USER="root"
APP_DIR="/opt/gr3mctrl"
REPO_URL="https://github.com/GeorgesGremion/Gr3mCtrl.git"
REPO_BRANCH="v0.1.0"
DATA_DIR="/var/lib/gr3mctrl"
MNT_DIR="/mnt/gr3mctrl"
BIN_DIR="$APP_DIR/bin"
BACKEND_BIN="/usr/local/bin/gr3mctrl-backend"
GATEWAY_BIN="/usr/local/bin/gr3mctrl-gateway"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE_BACKEND="gr3mctrl-backend.service"
SERVICE_GATEWAY="gr3mctrl-gateway.service"

log(){ echo "[gr3mctrl-installer] $*"; }
require_root(){ [ "$(id -u)" -eq 0 ] || { log "Bitte als root ausführen."; exit 1; }; }

install_prereqs(){
  log "Installiere Prereqs..."
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl git \
    qemu-system-x86 libvirt-daemon-system libvirt-clients libvirt-dev \
    zfsutils-linux samba nfs-kernel-server \
    golang pkg-config build-essential rsync software-properties-common

  # Docker aus dem offiziellen Repo inkl. compose v2 Plugin
  apt-get remove -y docker docker.io docker-doc docker-compose podman-docker containerd runc || true
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck source=/dev/null
  . /etc/os-release
  local codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Node.js 22 LTS aus dem offiziellen NodeSource Repo
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
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
  mkdir -p "$DATA_DIR" "$MNT_DIR" "$BIN_DIR"
}

write_metadata(){
  log "Schreibe Versionsinformationen..."
  local channel="${1:-release}"
  local branch commit tag
  branch=$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$REPO_BRANCH")
  commit=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
  tag=$(git -C "$APP_DIR" describe --tags --abbrev=0 2>/dev/null || echo "$branch")
  cat > "$APP_DIR/VERSION" <<EOFV
VERSION=$tag
BRANCH=$branch
COMMIT=$commit
CHANNEL=$channel
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOFV
  echo "$branch" > "$APP_DIR/BRANCH"
  echo "$channel" > "$APP_DIR/CHANNEL"
}

build_backend(){
  log "Baue Backend..."
  pushd "$APP_DIR/backend" >/dev/null
  go build -o "$BACKEND_BIN" ./main.go
  popd >/dev/null
}

build_gateway(){
  log "Baue Gateway + Frontend..."
  pushd "$APP_DIR/frontend" >/dev/null
  npm install
  npm run build
  mkdir -p "$FRONTEND_DIR/dist"
  rsync -a dist/ "$FRONTEND_DIR/dist/"
  popd >/dev/null
  pushd "$APP_DIR/backend" >/dev/null
  go build -o "$GATEWAY_BIN" ./cmd/gateway/main.go
  popd >/dev/null
}

install_scripts(){
  log "Installiere Hilfsskripte..."
  install -m 0755 "$APP_DIR/scripts/update.sh" "$BIN_DIR/update.sh"
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
Environment=GR3MCTRL_BACKEND_ADDR=127.0.0.1:8080
Restart=always

[Install]
WantedBy=multi-user.target
EOF2

  cat > /etc/systemd/system/$SERVICE_GATEWAY <<EOF3
[Unit]
Description=gr3mctrl Gateway Service (Frontend + Reverse Proxy)
After=network.target $SERVICE_BACKEND

[Service]
Type=simple
User=$APP_USER
Environment=GR3MCTRL_BACKEND_URL=http://127.0.0.1:8080
Environment=GR3MCTRL_FRONTEND_DIST=$FRONTEND_DIR/dist
Environment=GR3MCTRL_GATEWAY_ADDR=:4173
WorkingDirectory=$APP_DIR
ExecStartPre=/usr/bin/env bash -lc 'cd $FRONTEND_DIR && npm install && npm run build'
ExecStartPre=/usr/bin/env bash -lc 'cd $APP_DIR/backend && go build -o $GATEWAY_BIN ./cmd/gateway/main.go'
ExecStart=$GATEWAY_BIN
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
  systemctl enable --now $SERVICE_GATEWAY
}

main(){
  require_root
  install_prereqs
  clone_repo
  create_layout
  write_metadata "release"
  build_backend
  build_gateway
  install_scripts
  write_metadata "release"
  write_services
  setup_samba_include
  reload_enable
  log "Fertig. Backend lauscht intern auf 127.0.0.1:8080, Gateway öffentlich auf Port 4173."
}

main "$@"

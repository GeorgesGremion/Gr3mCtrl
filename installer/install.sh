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

require_root(){
  if [ "$(id -u)" -ne 0 ]; then
    echo "Bitte als root ausführen."
    exit 1
  fi
}

LOG_FILE="/var/log/gr3mctrl-install.log"
TOTAL_STEPS=11
PROGRESS_STEP=0
CURRENT_STEP_NAME="Starte Installer..."
CURRENT_FRAME=0
STEP_STATUS="läuft"
ANIMATION_PID=""

FRAMES=(
'      •
     / \
    •---•'
'•---•    
 \        
  \       
   •      '
'    •---•
     \ /
      • '
'   •    
  /      
 /       
 •---•   ')

read -r -d '' BANNER <<'EOF'
   ____                 __  __      _____      _ 
  / ___|_ __ ___  ___  |  \ /  | ___|_   _|   _| |
 | |  _| '__/ _ \ _ \ | |\/| |/ _ \ | || | | | |
 | |_| | | |  __/  __/ | |  | |  __/ | || |_| | |
  \____|_|  \___|\___| |_|  |_|\___| |_| \__,_|_|
EOF

mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"

log(){
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

render_ui(){
  local frame="${FRAMES[$CURRENT_FRAME]}"
  local bar_width=40
  local percent=$((PROGRESS_STEP * 100 / TOTAL_STEPS))
  local filled=$((PROGRESS_STEP * bar_width / TOTAL_STEPS))
  local bar=""
  local i
  for ((i=0;i<bar_width;i++)); do
    if [ $i -lt $filled ]; then
      bar+="#"
    else
      bar+="."
    fi
  done
  printf '\033[H\033[2J'
  printf "%s\n\n" "$BANNER"
  printf "%s\n\n" "$frame"
  printf " Schritt %2d/%2d: %s\n" "$((PROGRESS_STEP < TOTAL_STEPS ? PROGRESS_STEP + 1 : TOTAL_STEPS))" "$TOTAL_STEPS" "$CURRENT_STEP_NAME"
  printf " Status : %s\n" "$STEP_STATUS"
  printf " Log    : %s\n\n" "$LOG_FILE"
  printf " [%s] %3d%%\n" "$bar" "$percent"
  printf "\n  Installer läuft ... bitte warten.\n"
}

animate_ui(){
  tput civis >/dev/null 2>&1 || true
  while true; do
    render_ui
    CURRENT_FRAME=$(( (CURRENT_FRAME + 1) % ${#FRAMES[@]} ))
    sleep 0.2
  done
}

start_animation(){
  render_ui
  animate_ui &
  ANIMATION_PID=$!
}

stop_animation(){
  if [ -n "$ANIMATION_PID" ]; then
    kill "$ANIMATION_PID" >/dev/null 2>&1 || true
    wait "$ANIMATION_PID" 2>/dev/null || true
    ANIMATION_PID=""
  fi
  tput cnorm >/dev/null 2>&1 || true
  render_ui
}

run_step(){
  local label="$1"; shift
  CURRENT_STEP_NAME="$label"
  STEP_STATUS="läuft"
  render_ui
  set +e
  "$@" >>"$LOG_FILE" 2>&1
  local rc=$?
  set -e
  if [ $rc -ne 0 ]; then
    STEP_STATUS="Fehler"
    render_ui
    stop_animation
    echo -e "\n[!] Fehler bei Schritt: $label"
    echo "    Details siehe $LOG_FILE"
    exit 1
  fi
  PROGRESS_STEP=$((PROGRESS_STEP + 1))
  STEP_STATUS="ok"
  render_ui
}

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
  start_animation
  trap stop_animation EXIT
  run_step "Pakete installieren" install_prereqs
  run_step "Repository klonen" clone_repo
  run_step "Verzeichnisse anlegen" create_layout
  run_step "Metadaten schreiben" write_metadata "release"
  run_step "Backend bauen" build_backend
  run_step "Gateway/Frontend bauen" build_gateway
  run_step "Hilfsskripte installieren" install_scripts
  run_step "Metadaten aktualisieren" write_metadata "release"
  run_step "systemd Units schreiben" write_services
  run_step "Samba konfigurieren" setup_samba_include
  run_step "Dienste aktivieren" reload_enable
  STEP_STATUS="Fertig"
  PROGRESS_STEP=$TOTAL_STEPS
  render_ui
  stop_animation
  printf "\n✅ Installation abgeschlossen! UI: http://<host>:4173\n"
  printf "   Details im Log: %s\n" "$LOG_FILE"
}

main "$@"

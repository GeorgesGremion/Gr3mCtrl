#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/gr3mctrl"
FRONTEND_DIR="$APP_DIR/frontend"
BRANCH_FILE="$APP_DIR/BRANCH"
VERSION_FILE="$APP_DIR/VERSION"
BACKEND_BIN="/usr/local/bin/gr3mctrl-backend"
GATEWAY_BIN="/usr/local/bin/gr3mctrl-gateway"
SERVICE_BACKEND="gr3mctrl-backend.service"
SERVICE_GATEWAY="gr3mctrl-gateway.service"

usage() {
  echo "Usage: $0 [check|apply]" >&2
}

read_branch() {
  if [ -f "$BRANCH_FILE" ]; then
    cat "$BRANCH_FILE"
  else
    echo "main"
  fi
}

read_version_value() {
  local key="$1"
  [ -f "$VERSION_FILE" ] || return 1
  grep "^$key=" "$VERSION_FILE" | head -n1 | cut -d'=' -f2-
}

write_version_file() {
  local branch="$1"
  local commit="$2"
  local version_tag
  version_tag=$(git -C "$APP_DIR" describe --tags --abbrev=0 2>/dev/null || echo "$branch")
  cat >"$VERSION_FILE" <<EOF
VERSION=$version_tag
BRANCH=$branch
COMMIT=$commit
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  echo "$branch" >"$BRANCH_FILE"
}

check_update() {
  local branch current_commit remote_commit version build_date
  branch=$(read_branch)
  git -C "$APP_DIR" fetch origin "$branch" >/dev/null 2>&1 || true
  current_commit=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
  if git -C "$APP_DIR" rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
    remote_commit=$(git -C "$APP_DIR" rev-parse "origin/$branch")
  else
    remote_commit="$current_commit"
  fi
  version=$(read_version_value "VERSION" || true)
  build_date=$(read_version_value "BUILD_DATE" || true)
  local available="false"
  if [ "$current_commit" != "$remote_commit" ]; then
    available="true"
  fi
  cat <<EOF
{"branch":"$branch","current_version":"${version:-unknown}","build_date":"${build_date:-}","current_commit":"$current_commit","remote_commit":"$remote_commit","update_available":$available}
EOF
}

apply_update_inner() {
  local branch remote_commit
  branch=$(read_branch)
  git -C "$APP_DIR" fetch origin "$branch"
  remote_commit=$(git -C "$APP_DIR" rev-parse "origin/$branch")
  local current_commit
  current_commit=$(git -C "$APP_DIR" rev-parse HEAD)
  if [ "$current_commit" = "$remote_commit" ]; then
    cat <<EOF
{"status":"noop","message":"Bereits aktuell","current_commit":"$current_commit"}
EOF
    return 0
  fi

  systemctl stop "$SERVICE_GATEWAY" "$SERVICE_BACKEND" >/dev/null 2>&1 || true

  git -C "$APP_DIR" checkout "$branch"
  git -C "$APP_DIR" reset --hard "origin/$branch"

  pushd "$APP_DIR/backend" >/dev/null
  go build -o "$BACKEND_BIN" ./main.go
  go build -o "$GATEWAY_BIN" ./cmd/gateway/main.go
  popd >/dev/null

  pushd "$FRONTEND_DIR" >/dev/null
  npm install
  npm run build
  popd >/dev/null

  write_version_file "$branch" "$remote_commit"

  systemctl start "$SERVICE_BACKEND"
  systemctl start "$SERVICE_GATEWAY"

  cat <<EOF
{"status":"success","message":"Update installiert","current_commit":"$remote_commit"}
EOF
}

apply_update() {
  local tmp rc err
  tmp=$(mktemp)
  set +e
  apply_update_inner >"$tmp" 2>&1
  rc=$?
  err=$(cat "$tmp")
  rm -f "$tmp"
  set -e
  if [ $rc -ne 0 ]; then
    ERR_MSG="$err" python3 - <<'PY'
import json, os, sys
msg = os.environ.get("ERR_MSG","Update fehlgeschlagen").strip()
print(json.dumps({"status":"error","message": msg if msg else "Update fehlgeschlagen"}))
PY
    exit 1
  else
    echo "$err"
  fi
}

case "${1:-check}" in
  check) check_update ;;
  apply) apply_update ;;
  *) usage; exit 1 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/gr3mctrl"
FRONTEND_DIR="$APP_DIR/frontend"
BRANCH_FILE="$APP_DIR/BRANCH"
CHANNEL_FILE="$APP_DIR/CHANNEL"
VERSION_FILE="$APP_DIR/VERSION"
BACKEND_BIN="/usr/local/bin/gr3mctrl-backend"
GATEWAY_BIN="/usr/local/bin/gr3mctrl-gateway"
SERVICE_BACKEND="gr3mctrl-backend.service"
SERVICE_GATEWAY="gr3mctrl-gateway.service"
REPO_SLUG="GeorgesGremion/Gr3mCtrl"

usage() {
  echo "Usage: $0 [check|apply]" >&2
}

read_branch() {
  if [ -f "$BRANCH_FILE" ]; then
    tr -d '\r' < "$BRANCH_FILE"
  else
    echo "main"
  fi
}

read_channel() {
  if [ -f "$CHANNEL_FILE" ]; then
    tr -d '\r' < "$CHANNEL_FILE"
    return
  fi
  local value
  value=$(read_version_value "CHANNEL" || true)
  if [ -n "$value" ]; then
    echo "$value"
  else
    echo "branch"
  fi
}

read_version_value() {
  local key="$1"
  [ -f "$VERSION_FILE" ] || return 1
  grep "^$key=" "$VERSION_FILE" | head -n1 | cut -d'=' -f2-
}

write_version_file() {
  local ref="$1"
  local commit="$2"
  local channel="${3:-branch}"
  local version_tag="$ref"
  cat >"$VERSION_FILE" <<EOF
VERSION=$version_tag
BRANCH=$ref
COMMIT=$commit
CHANNEL=$channel
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  echo "$ref" >"$BRANCH_FILE"
  echo "$channel" >"$CHANNEL_FILE"
}

check_update_branch() {
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
{"channel":"branch","branch":"$branch","current_version":"${version:-unknown}","build_date":"${build_date:-}","current_commit":"$current_commit","remote_commit":"$remote_commit","latest_version":"$branch","update_available":$available}
EOF
}

check_update_release() {
  local version build_date current_commit release_json
  version=$(read_version_value "VERSION" || true)
  build_date=$(read_version_value "BUILD_DATE" || true)
  current_commit=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
  release_json=$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: gr3mctrl-updater" "https://api.github.com/repos/$REPO_SLUG/releases/latest" || true)
  if [ -z "$release_json" ]; then
    cat <<EOF
{"channel":"release","current_version":"${version:-unknown}","build_date":"${build_date:-}","current_commit":"$current_commit","remote_commit":"","latest_version":"","release_notes":"","update_available":false,"error":"release fetch failed"}
EOF
    return
  fi
  git -C "$APP_DIR" fetch --tags origin >/dev/null 2>&1 || true
  RELEASE_JSON="$release_json" CURRENT_VERSION="${version:-}" BUILD_DATE="${build_date:-}" CURRENT_COMMIT="$current_commit" APP_DIR="$APP_DIR" python3 - <<'PY'
import json, os, subprocess
release=json.loads(os.environ["RELEASE_JSON"])
tag=release.get("tag_name") or ""
published=release.get("published_at") or ""
notes=release.get("body") or ""
remote_commit=""
if tag:
    try:
        remote_commit=subprocess.check_output(["git","-C",os.environ["APP_DIR"],"rev-parse",f"refs/tags/{tag}^{{commit}}"], text=True).strip()
    except subprocess.CalledProcessError:
        remote_commit=""
available = bool(tag) and tag != os.environ.get("CURRENT_VERSION","")
out={
    "channel": "release",
    "current_version": os.environ.get("CURRENT_VERSION",""),
    "build_date": os.environ.get("BUILD_DATE",""),
    "current_commit": os.environ.get("CURRENT_COMMIT",""),
    "remote_commit": remote_commit,
    "latest_version": tag,
    "latest_published": published,
    "release_notes": notes,
    "update_available": available
}
print(json.dumps(out))
PY
}

check_update() {
  local channel
  channel=$(read_channel)
  if [ "$channel" = "release" ]; then
    check_update_release
  else
    check_update_branch
  fi
}

apply_branch_update() {
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

  write_version_file "$branch" "$remote_commit" "branch"

  systemctl start "$SERVICE_BACKEND"
  systemctl start "$SERVICE_GATEWAY"

  cat <<EOF
{"status":"success","message":"Update installiert","current_commit":"$remote_commit"}
EOF
}

apply_release_update() {
  local release_json tag remote_commit
  if ! release_json=$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: gr3mctrl-updater" "https://api.github.com/repos/$REPO_SLUG/releases/latest"); then
    echo '{"status":"error","message":"Release konnte nicht geladen werden"}'
    return 1
  fi
  tag=$(RELEASE_JSON="$release_json" python3 - <<'PY'
import json, os
release=json.loads(os.environ["RELEASE_JSON"])
print(release.get("tag_name",""))
PY
)
  if [ -z "$tag" ]; then
    echo '{"status":"error","message":"Keine Release-Version gefunden"}'
    return 1
  fi
  git -C "$APP_DIR" fetch --tags origin >/dev/null 2>&1
  remote_commit=$(git -C "$APP_DIR" rev-parse "refs/tags/$tag^{commit}")

  systemctl stop "$SERVICE_GATEWAY" "$SERVICE_BACKEND" >/dev/null 2>&1 || true

  git -C "$APP_DIR" checkout --force "$tag"
  git -C "$APP_DIR" reset --hard "$remote_commit"

  pushd "$APP_DIR/backend" >/dev/null
  go build -o "$BACKEND_BIN" ./main.go
  go build -o "$GATEWAY_BIN" ./cmd/gateway/main.go
  popd >/dev/null

  pushd "$FRONTEND_DIR" >/dev/null
  npm install
  npm run build
  popd >/dev/null

  write_version_file "$tag" "$remote_commit" "release"

  systemctl start "$SERVICE_BACKEND"
  systemctl start "$SERVICE_GATEWAY"

  cat <<EOF
{"status":"success","message":"Update auf $tag installiert","version":"$tag"}
EOF
}

apply_update() {
  local channel
  channel=$(read_channel)
  if [ "$channel" = "release" ]; then
    apply_release_update
    return
  fi
  local tmp rc err
  tmp=$(mktemp)
  set +e
  apply_branch_update >"$tmp" 2>&1
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

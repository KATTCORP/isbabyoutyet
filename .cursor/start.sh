#!/usr/bin/env bash
# Cursor Cloud `start`: runs detached on every agent boot and is never
# awaited. Starts the dev servers in tmux sessions (also logged to
# /tmp/<session>.log) and waits until they answer. Safe to rerun: sessions
# that already exist are left alone. Installs belong in .cursor/install.sh.
set -uo pipefail

cd "$(dirname "$0")/.."

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use --silent "$(cat .nvmrc)"
export PATH="$NVM_BIN:$PATH"

tmux_conf=/exec-daemon/tmux.portal.conf
tmux() {
  if [ -f "$tmux_conf" ]; then
    command tmux -f "$tmux_conf" "$@"
  else
    command tmux "$@"
  fi
}

start_session() {
  local name=$1 dir=$2 cmd=$3
  if tmux has-session -t "=$name" 2>/dev/null; then
    echo "$name: tmux session already running"
    return 0
  fi
  tmux new-session -d -s "$name" -c "$PWD/$dir" -e "PATH=$PATH" \
    "$cmd 2>&1 | tee /tmp/$name.log"
  echo "$name: started '$cmd' in $dir"
}

wait_for() {
  local name=$1 url=$2
  for _ in $(seq 1 180); do
    if curl -s -o /dev/null --max-time 60 "$url"; then
      echo "$name: ready at $url"
      return 0
    fi
    sleep 1
  done
  echo "$name: no response from $url; see /tmp/$name.log" >&2
  return 1
}

status=0

# Backend `pnpm dev` also seeds the homepage demo once Convex is up.
start_session convex projects/isbabyoutyet/backend "pnpm dev"
wait_for convex http://127.0.0.1:3210/version || status=1

start_session web projects/isbabyoutyet/web "pnpm dev"
start_session sous projects/sous-vide-guide/web "pnpm dev"
wait_for web http://localhost:3000 || status=1
wait_for sous http://localhost:3002 || status=1

exit "$status"

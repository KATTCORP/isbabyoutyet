#!/usr/bin/env bash
# Cursor Cloud `install`: runs once per environment build on the default
# branch, then the disk is snapshotted and every agent boots from it. Do the
# slow work here and keep .cursor/start.sh fast. Must stay idempotent: an
# agent that boots without a build runs this itself.
set -euo pipefail

cd "$(dirname "$0")/.."

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$(cat .nvmrc)"
nvm alias default "$(cat .nvmrc)"
export PATH="$NVM_BIN:$PATH"

# /exec-daemon/node (Node 22) sits ahead of nvm on every shell's PATH, and
# nvm only swaps its own entry in place. Agent shells and `bash -l` both
# source ~/.bashrc, so put the pinned Node first there.
bashrc_marker="# cursor-cloud: pinned Node ahead of /exec-daemon/node"
if ! grep -qF "$bashrc_marker" "$HOME/.bashrc" 2>/dev/null; then
  # shellcheck disable=SC2016
  printf '\n%s\n[ -n "${NVM_BIN:-}" ] && export PATH="$NVM_BIN:$PATH"\n' \
    "$bashrc_marker" >> "$HOME/.bashrc"
fi

corepack enable
corepack install
echo "Using node $(node -v) / pnpm $(pnpm -v)"

pnpm install --frozen-lockfile

# The homepage demo photos are Git LFS objects; the checkout only has pointers.
# `git lfs pull` can leave stale index entries, and git reports any size
# mismatch as modified, so re-add the (unchanged) files to refresh them.
lfs_assets=projects/isbabyoutyet/backend/assets/homepage-demo
git lfs pull --include "$lfs_assets/**"
git add -- "$lfs_assets"

# Web app Vite env (VITE_CONVEX_URL etc.); .env.local is gitignored.
(cd projects/isbabyoutyet/web && { [ -f .env.local ] || pnpm setup-dev; })

# Local anonymous Convex backend: provision, set its env vars and VAPID keys,
# and seed the demo logins. Gated on .env.local so it only runs against a
# fresh backend. On a busy build pod, seeding can exceed
# Convex's 1s mutation limit on the freshly started backend; every step is
# idempotent, so retry. provision writes .env.local before seeding, so drop it
# on final failure or the next run would skip the seed.
setup_backend() {
  cd projects/isbabyoutyet/backend
  [ -f .env.local ] && return 0
  local attempt
  for attempt in 1 2 3; do
    pnpm setup-dev && return 0
    echo "Backend setup-dev attempt $attempt failed" >&2
    sleep 5
  done
  rm -f .env.local
  return 1
}
(setup_backend)

# `pnpm dev` seeds the homepage demo once `convex dev` has pushed functions,
# and the seed skips work that is already stored. Seed now so the snapshot is
# complete and agent boots skip the photo uploads. `--start` only runs after
# the first successful push, so its marker means the functions are live.
seed_homepage_demo() {
  cd projects/isbabyoutyet/backend
  local ready=/tmp/convex-install-ready log=/tmp/convex-install.log
  rm -f "$ready"
  CONVEX_AGENT_MODE=anonymous setsid pnpm exec convex dev --local-force-upgrade \
    --start "touch $ready && sleep infinity" > "$log" 2>&1 &
  local convex_pgid=$!
  local status=1
  for _ in $(seq 1 180); do
    [ -f "$ready" ] && break
    kill -0 "$convex_pgid" 2>/dev/null || break
    sleep 1
  done
  if [ -f "$ready" ]; then
    status=0
    pnpm seed:homepage || status=$?
  fi
  kill -- "-$convex_pgid" 2>/dev/null || true
  wait "$convex_pgid" 2>/dev/null || true
  if [ "$status" -ne 0 ]; then
    cat "$log" >&2
  fi
  return "$status"
}
(seed_homepage_demo)

echo "Install complete."

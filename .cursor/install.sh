#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for isbabyoutyet.
# Installs the pinned Node major, workspace deps, and a seeded local
# anonymous Convex backend. Safe to re-run against cached/partial state.
set -euo pipefail

cd "$(dirname "$0")/.."

# The base image ships an older Node ahead of nvm on PATH, so pin Node 24
# (see .nvmrc / package.json engines) explicitly and put it first.
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
export PATH="$(dirname "$(nvm which default)"):$PATH"

corepack enable

echo "Using node $(node -v) / pnpm $(pnpm -v)"

pnpm install --frozen-lockfile

# Web app dev env file (VITE_CONVEX_URL etc.); .env.local is gitignored.
(cd projects/isbabyoutyet/web && [ -f .env.local ] || pnpm setup-dev)

# Provision the local anonymous Convex backend, set its env vars, generate
# VAPID keys, and seed demo data (login + babies in every status + homepage
# demo text). Gated on .env.local so it only runs on a fresh backend.
(cd projects/isbabyoutyet/backend && [ -f .env.local ] || pnpm setup-dev)

echo "Install complete."

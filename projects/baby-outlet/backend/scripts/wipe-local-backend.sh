#!/bin/sh
# Delete this package's local anonymous Convex DB. Refuses cloud/prod deployments.
set -e

env_file=".env.local"
dep=""

if [ -f "$env_file" ]; then
  dep=$(grep '^CONVEX_DEPLOYMENT=' "$env_file" | cut -d= -f2- | tr -d '\r')
  if [ -n "$dep" ] && [ "${dep#anonymous:}" = "$dep" ]; then
    echo "Refusing to reset: CONVEX_DEPLOYMENT is not anonymous ($dep)" >&2
    exit 1
  fi
fi

name=$(basename "${dep#anonymous:}")
case "$name" in
"" | "." | "..") name=anonymous-agent ;;
esac

rm -rf "$HOME/.convex/anonymous-convex-backend-state/$name" .env.local .convex .seed-photos-pending.local

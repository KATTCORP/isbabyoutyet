#!/usr/bin/env bash
# Build raf-query from a checkout and pack its packages into this directory.
# Usage: ./vendor/raf-query/pack.sh <path to a raf-query checkout>
set -euo pipefail

checkout=$(cd "${1:?Pass the path to a raf-query checkout}" && pwd)
out=$(cd "$(dirname "$0")" && pwd)
version=0.14.0-parts.0

(cd "$checkout" && pnpm install --frozen-lockfile && pnpm build)
for package in core react; do
	(
		cd "$checkout/packages/$package"
		# The tarball's version marks it as unreleased; the checkout keeps its own.
		cp package.json package.json.orig
		trap 'mv package.json.orig package.json' EXIT
		npm pkg set version="$version"
		pnpm pack --out "$out/raf-query-$package-$version.tgz"
	)
done

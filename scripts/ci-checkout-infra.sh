#!/bin/sh
set -eu

# pnpm-lock.yaml records @ojson/infra as link:../../devops/infra, the path
# from this repository to the metarepo checkout. A GitHub checkout of models
# is alone, so the public infra repo has to sit at that path before install.
# A local metarepo already has the directory; leave it in place.

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
dest=$(CDPATH= cd -- "$root/../.." && pwd)/devops/infra
sha=5352c30742fd81b922cd130aafc122eaf1a5164d

if [ -f "$dest/package.json" ]; then
  exit 0
fi

mkdir -p "$(dirname "$dest")"
rm -rf "$dest"
git init -q "$dest"
git -C "$dest" remote add origin https://github.com/ojson-platform/infra.git
git -C "$dest" fetch --depth 1 origin "$sha"
git -C "$dest" checkout --detach --quiet FETCH_HEAD

# The link does not install infra's own dependencies. eslint, vitest and tsc
# resolve from that package. infra does not commit a lockfile. A flat
# node_modules lets vitest see @vitest/coverage-v8, which is declared on infra.
printf '%s\n' 'node-linker=hoisted' > "$dest/.npmrc"
pnpm install --no-frozen-lockfile --dir "$dest"

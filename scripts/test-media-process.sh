#!/usr/bin/env bash
# Run from any directory: bash scripts/test-media-process.sh
# Requires local Docker with Linux containers and network access only while
# building (public Node/Alpine/npm downloads). Tests have no external network,
# host mounts, application credentials or production services.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
fixture_id="$(date +%s)-$$"
fixture_image="tmx-process-sandbox-fixture:${fixture_id}"
fixture_container="tmx-process-sandbox-fixture-${fixture_id}"
cleanup() {
  docker container rm -f "$fixture_container" >/dev/null 2>&1 || true
  docker image rm "$fixture_image" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Explicit context whitelist: never send the checkout, .env files, local
# dependencies, Git data or host build outputs to the Docker daemon.
COPYFILE_DISABLE=1 tar --no-xattrs --no-acls \
  --exclude='.env*' --exclude=node_modules --exclude='*.tsbuildinfo' --exclude='._*' \
  -cf - \
  scripts/media-process.Dockerfile \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json \
  packages/api/package.json packages/web/package.json \
  packages/core/package.json packages/core/tsconfig.json packages/core/tsup.config.ts \
  packages/core/src packages/core/test/media-process.integration.mjs \
  packages/shared/package.json packages/shared/tsconfig.json packages/shared/src \
  | docker build --file scripts/media-process.Dockerfile --tag "$fixture_image" -

# Exercise the ordinary unprivileged container profile.
docker run --rm --pull never --name "$fixture_container" \
  --network none --read-only --cap-drop ALL --user 65534:65534 \
  --security-opt no-new-privileges --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --tmpfs /scratch:rw,exec,nosuid,nodev,size=1g,mode=1777 \
  --entrypoint /usr/bin/env "$fixture_image" -i \
  HOME=/scratch PATH=/usr/local/bin:/usr/bin:/bin TMPDIR=/scratch \
  TMX_MEDIA_PROCESS_FIXTURE=network-none-synthetic \
  node --test --test-concurrency=1 test/media-process.integration.mjs

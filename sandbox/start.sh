#!/usr/bin/env bash
# Starts the media-canvas agent sandbox. THIS SCRIPT RUNS ON THE HOST.
# A sandboxed agent can edit this file, and the edits run on your host the
# next time that you start it. Review `git diff -- sandbox/` before each
# start.
#
# The security flags (--cap-drop, --security-opt, the mount list) are the
# sandbox boundary. Do not weaken them. The resource limits below them only
# protect the host. Edit those freely.
#
# --network=host is deliberate: the infrastructure stack runs on the host
# (`docker compose up -d`), and sharing the host network lets the sandbox
# reach postgres, redis, and garage at the same localhost URLs the host uses,
# with no second set of service URLs to keep in step. It also means the
# sandbox reaches anything else bound to the host's loopback, and can bind
# host ports. The network was already open — this widens what "open" reaches.
#
# --dns is the systemd-resolved quirk: this host's /etc/resolv.conf points at
# the 127.0.0.53 stub, which does not answer from inside the container, so
# names fail while raw addresses work. Public resolvers rather than this
# network's router, so the script keeps working on another network.
#
# CI=true is what keeps unattended runs from stalling. node_modules is shared
# with the host through the repository mount, and pnpm keeps its store beside
# it (/workspace/.pnpm-store, gitignored) because the container home is a
# different filesystem. Whenever pnpm sees a store other than the one that
# built node_modules — after any host-side install — it wants to purge and
# reinstall, and it aborts on that question without a TTY. CI=true answers it.
# The one consequence: `pnpm install` then defaults to --frozen-lockfile, so
# a hand-edited package.json needs `pnpm install --no-frozen-lockfile`.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
NAME="sandbox-media-canvas"

tty_flags="-i"
[ -t 0 ] && tty_flags="-it"

exec podman run \
  --rm $tty_flags \
  --name "$NAME" \
  --cap-drop=all \
  --security-opt=no-new-privileges \
  --userns=keep-id:uid=1000,gid=1000 \
  --network=host \
  --dns 1.1.1.1 \
  --dns 8.8.8.8 \
  --pids-limit=2048 \
  --memory=8g \
  --cpus=4 \
  --volume "$REPO:/workspace" \
  --volume "$NAME-home:/home/agent" \
  --env "GIT_AUTHOR_NAME=$(git config user.name)" \
  --env "GIT_AUTHOR_EMAIL=$(git config user.email)" \
  --env "GIT_COMMITTER_NAME=$(git config user.name)" \
  --env "GIT_COMMITTER_EMAIL=$(git config user.email)" \
  --env CI=true \
  --workdir /workspace \
  "$NAME" \
  "${@:-bash}"

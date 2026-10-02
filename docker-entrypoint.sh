#!/bin/sh
set -e

# A fresh bind mount (./data:/data) is created by Docker as root, which would
# stop the non-root `node` user from writing the SQLite DB. Fix ownership on
# first boot, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data 2>/dev/null || true
  exec su-exec node:node "$@"
fi

exec "$@"

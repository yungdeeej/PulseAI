#!/bin/bash
# Post-merge setup: installs deps + lets the bot's AUTO_MIGRATE handle
# schema upgrades on its next start (workflow reconciliation restarts it).
set -e

echo "[post-merge] pnpm install"
pnpm install --prefer-offline --reporter=append-only

echo "[post-merge] done"

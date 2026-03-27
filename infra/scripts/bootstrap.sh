#!/usr/bin/env bash
set -euo pipefail

echo "Bootstrap workspace"
corepack enable
pnpm install

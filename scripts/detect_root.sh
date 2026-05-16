#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STANDALONE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$STANDALONE_ROOT/project/configs/project_profile.json" ]; then
  printf '%s\n' "$STANDALONE_ROOT"
else
  cd "$SCRIPT_DIR/../.." || exit 1
  pwd
fi

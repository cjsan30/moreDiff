#!/usr/bin/env bash
set -u

ROOT_DIR="$(bash "$(dirname "$0")/detect_root.sh")"
MAKE_CMD="$(bash "$ROOT_DIR/harness/scripts/resolve_make.sh")"

cd "$ROOT_DIR" || exit 1
"$MAKE_CMD" unit

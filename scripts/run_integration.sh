#!/usr/bin/env bash
set -u

ROOT_DIR="$(bash "$(dirname "$0")/detect_root.sh")"
# shellcheck source=scripts/ensure_wsl_node.sh
. "$ROOT_DIR/scripts/ensure_wsl_node.sh"
if [ -f "$ROOT_DIR/scripts/resolve_make.sh" ]; then
  MAKE_CMD="$(bash "$ROOT_DIR/scripts/resolve_make.sh")"
else
  MAKE_CMD="$(bash "$ROOT_DIR/harness/scripts/resolve_make.sh")"
fi

cd "$ROOT_DIR" || exit 1
"$MAKE_CMD" integration

#!/usr/bin/env bash
set -u

ROOT_DIR="$(bash "$(dirname "$0")/detect_root.sh")"
# shellcheck source=scripts/ensure_wsl_node.sh
. "$ROOT_DIR/scripts/ensure_wsl_node.sh"

cd "$ROOT_DIR" || exit 1
npm test "$@"

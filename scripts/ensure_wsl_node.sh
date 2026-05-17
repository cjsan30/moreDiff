#!/usr/bin/env bash

# Source this file from bash entrypoints that may be invoked through
# powershell.exe. In that path, Windows npm can appear before WSL/NVM npm.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
fi

NPM_PATH="$(command -v npm 2>/dev/null || true)"
if [ -n "$NPM_PATH" ] && printf '%s' "$NPM_PATH" | grep -q '^/mnt/c/'; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -n 1)"
  if [ -n "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi

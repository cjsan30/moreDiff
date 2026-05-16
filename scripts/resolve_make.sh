#!/usr/bin/env bash
set -u

if command -v make >/dev/null 2>&1; then
    printf "make\n"
elif command -v mingw32-make >/dev/null 2>&1; then
    printf "mingw32-make\n"
else
    exit 1
fi

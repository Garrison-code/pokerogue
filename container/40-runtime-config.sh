#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
set -eu
output=/usr/share/nginx/html/runtime-config.js
# Explicit public allowlist; jq safely escapes quotes and newlines.
{
  printf 'globalThis.__POKEROGUE_CONFIG__ = Object.freeze('
  jq -cn \
    --arg api "${VITE_SERVER_URL:-/api}" \
    --arg login "${VITE_BYPASS_LOGIN:-0}" \
    --arg tutorial "${VITE_BYPASS_TUTORIAL:-0}" \
    --arg discord "${VITE_DISCORD_CLIENT_ID:-}" \
    --arg google "${VITE_GOOGLE_CLIENT_ID:-}" \
    '{VITE_SERVER_URL:$api,VITE_BYPASS_LOGIN:$login,VITE_BYPASS_TUTORIAL:$tutorial,VITE_DISCORD_CLIENT_ID:$discord,VITE_GOOGLE_CLIENT_ID:$google}'
  printf ');\n'
} > "$output.tmp"
mv "$output.tmp" "$output"

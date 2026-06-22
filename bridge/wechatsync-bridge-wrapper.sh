#!/bin/bash
# wechatsync-bridge-wrapper.sh
# Reads token from /etc/wechatsync-token.conf (base64 encoded)

TOKEN_FILE="/etc/wechatsync-token.conf"
if [ -f "$TOKEN_FILE" ]; then
    TOKEN=$(cat "$TOKEN_FILE" | base64 -d)
    export WECHATSYNC_TOKEN="$TOKEN"
fi

exec /usr/local/bin/node /usr/local/share/wechatsync-bridge/wechatsync-server.mjs

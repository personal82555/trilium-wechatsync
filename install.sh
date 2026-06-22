#!/bin/bash
# install.sh — One-command installer for TriliumNext WechatSync Publisher Bridge
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║  TriliumNext × WechatSync Publisher Bridge  ║"
echo "╚══════════════════════════════════════════════╝"

# --- Config ---
BRIDGE_DIR="/usr/local/share/wechatsync-bridge"
SERVICE_FILE="/etc/systemd/system/wechatsync-bridge.service"
TOKEN_FILE="/etc/wechatsync-token.conf"
WRAPPER="/usr/local/bin/wechatsync-bridge-wrapper.sh"
WS_PORT="${SYNC_WS_PORT:-9600}"

# --- Step 1: Install bridge server ---
echo "[1/5] Installing bridge server..."
mkdir -p "$BRIDGE_DIR"
cp "$(dirname $0)/bridge/wechatsync-server.mjs" "$BRIDGE_DIR/"
cp "$(dirname $0)/bridge/wechatsync-bridge-wrapper.sh" "$WRAPPER"
chmod +x "$WRAPPER"
chmod 644 "$BRIDGE_DIR/wechatsync-server.mjs"
echo "  ✅ Bridge server installed to $BRIDGE_DIR"

# --- Step 2: Install systemd service ---
echo "[2/5] Installing systemd service..."
if [ -f "$SERVICE_FILE" ]; then
    echo "  ⚠️  Service already exists, backing up to ${SERVICE_FILE}.bak"
    cp "$SERVICE_FILE" "${SERVICE_FILE}.bak"
fi

cat > "$SERVICE_FILE" << SERVICE_EOF
[Unit]
Description=WechatSync Bridge Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=$WRAPPER
Restart=always
RestartSec=5
Environment=SYNC_WS_PORT=$WS_PORT
[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload
echo "  ✅ Service installed"

# --- Step 3: Set up token ---
echo "[3/5] Token setup..."
if [ ! -f "$TOKEN_FILE" ]; then
    DEFAULT_TOKEN=$(uuidgen 2>/dev/null || echo "your-token-here")
    echo -n "$DEFAULT_TOKEN" | base64 > "$TOKEN_FILE"
    echo "  ✅ Generated token: $DEFAULT_TOKEN"
    echo "  ⚠️  COPY this token — you'll need it for the Chrome extension!"
else
    echo "  ✅ Token file already exists"
fi

# --- Step 4: Start bridge ---
echo "[4/5] Starting bridge..."
systemctl enable wechatsync-bridge 2>/dev/null
systemctl restart wechatsync-bridge
sleep 2

if systemctl is-active wechatsync-bridge > /dev/null 2>&1; then
    echo "  ✅ Bridge running (WS:$WS_PORT, HTTP:$((WS_PORT+1)))"
else
    echo "  ❌ Bridge failed to start. Check: systemctl status wechatsync-bridge"
    exit 1
fi

# --- Step 5: Print instructions ---
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅  Installation complete!                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  WebSocket :$WS_PORT  ← Extensions connect here   ║"
echo "║  HTTP API :$((WS_PORT+1))  ← CLI/sync forward here ║"
echo "║                                              ║"
echo "║  To connect your Chrome extension:           ║"
echo "║  1. Install WechatSync extension             ║"
echo "║  2. Open extension settings                  ║"
echo "║  3. Server: ws://YOUR_SERVER_IP:$WS_PORT    ║"
echo "║  4. Token: $(cat $TOKEN_FILE | base64 -d)      ║"
echo "║  5. Click Connect                            ║"
echo "║                                              ║"
echo "║  Now apply the TriliumNext patches:          ║"
echo "║    patch/patch.sh                            ║"
echo "╚══════════════════════════════════════════════╝"

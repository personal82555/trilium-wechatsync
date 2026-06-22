# TriliumNext WechatSync Publisher Patch
# Apply these patches to your TriliumNext server source

set -e
TRILIUM_DIR="${1:-/path/to/trilium}"
echo "Applying patches to $TRILIUM_DIR..."

# Patch 1: wechatsync.ts — full publisher with bridge check, retry, URL extraction
PATCH_SRC="$(dirname $0)/wechatsync.ts"
TARGET="$TRILIUM_DIR/apps/server/src/services/publisher/wechatsync.ts"
if [ -f "$PATCH_SRC" ]; then
    cp "$PATCH_SRC" "$TARGET"
    echo "  ✅ wechatsync.ts patched"
else
    echo "  ⚠️  Patch file not found: $PATCH_SRC"
fi

# Patch 2: publisher_frontend.ts — add /api/publisher/status endpoint
PATCH_SRC2="$(dirname $0)/publisher_frontend.ts"
TARGET2="$TRILIUM_DIR/apps/server/src/routes/api/publisher_frontend.ts"
if [ -f "$PATCH_SRC2" ]; then
    cp "$PATCH_SRC2" "$TARGET2"
    echo "  ✅ publisher_frontend.ts patched"
else
    echo "  ⚠️  Patch file not found: $PATCH_SRC2"
fi

# Patch 3: publish.html — bridge status indicator + clickable results
PATCH_SRC3="$(dirname $0)/publish.html"
TARGET3="$TRILIUM_DIR/apps/client/public/publish.html"
if [ -f "$PATCH_SRC3" ]; then
    cp "$PATCH_SRC3" "$TARGET3"
    echo "  ✅ publish.html patched"
else
    echo "  ⚠️  Patch file not found: $PATCH_SRC3"
fi

# Rebuild
echo ""
echo "Rebuilding TriliumNext server..."
cd "$TRILIUM_DIR" && pnpm server:build
echo ""
echo "✅ All patches applied! Restart TriliumNext to take effect:"
echo "   systemctl restart triliumnext"

#!/bin/bash
# Script to compile translation files for Kiwi Menu extension using gnome-extensions
# NOTE: This is for local testing only. When installing the extension,
# translations are automatically compiled from the po/ directory.

set -e

EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="kiwimenu@kemma"
TEMP_DIR=$(mktemp -d)

echo "Compiling translations for Kiwi Menu using gnome-extensions pack..."
echo "NOTE: This is for testing only. Translations are auto-compiled on installation."
echo ""

# Pack the extension with translations to a temporary location
echo "Packing extension with translations..."
gnome-extensions pack "$EXTENSION_DIR" \
    --force \
    --podir=po \
    --out-dir="$TEMP_DIR" \
    > /dev/null 2>&1

# Extract the packed extension
echo "Extracting locale directory..."
cd "$TEMP_DIR"
unzip -q "${UUID}.shell-extension.zip" -d extracted

# Copy the locale directory to the extension root for testing
if [ -d "extracted/locale" ]; then
    rm -rf "$EXTENSION_DIR/locale"
    cp -r "extracted/locale" "$EXTENSION_DIR/"
    echo "✓ Translations compiled successfully!"
    echo "✓ Locale directory copied to: $EXTENSION_DIR/locale"
else
    echo "✗ No locale directory found in packed extension"
    exit 1
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "Local testing translations are ready."
echo "To package for distribution, use:"
echo "  gnome-extensions pack --podir=po"

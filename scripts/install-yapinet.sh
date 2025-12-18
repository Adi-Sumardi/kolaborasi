#!/bin/bash

# =====================================================
# QUICK INSTALLER FOR KOLABORASI.YAPINET.ID
# Run this script on fresh VPS to deploy the app
# VPS IP: 103.31.204.211
# =====================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   🚀 KOLABORASI.YAPINET.ID - QUICK INSTALLER              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run with sudo: sudo bash install-yapinet.sh"
    exit 1
fi

# Install git and curl if not available
apt-get update -qq
apt-get install -y -qq git curl

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

echo "📥 Downloading deploy script from yapinet branch..."
curl -sSL -o deploy.sh https://raw.githubusercontent.com/Adi-Sumardi/kolaborasi/yapinet/scripts/deploy.sh

echo "🚀 Starting deployment..."
bash deploy.sh

# Cleanup
rm -rf $TEMP_DIR

echo ""
echo "✅ Installation complete!"
echo ""

#!/bin/bash
set -e

APP_DIR="/var/www/kolaborasi"
PM2_NAME="kolaborasi"

echo "======================================"
echo "  Deploy: $PM2_NAME"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

cd "$APP_DIR"

echo ""
echo "[1/4] Pull latest code..."
sudo git pull origin master

echo ""
echo "[2/4] Run database migrations..."
sudo node scripts/migrate.js

echo ""
echo "[3/4] Build..."
sudo npm run build

echo ""
echo "[4/4] Restart app..."
sudo pm2 restart "$PM2_NAME"

echo ""
echo "======================================"
echo "  Deploy selesai!"
echo "  Status: $(sudo pm2 show $PM2_NAME | grep status | head -1 | awk '{print $4}')"
echo "======================================"

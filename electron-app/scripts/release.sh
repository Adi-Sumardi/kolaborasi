#!/bin/bash
# Build Desktop Agent lalu upload SEMUA artefak (installer + .blockmap + .yml)
# langsung ke public/downloads/ di server — di LUAR jalur git (lihat .gitignore).
#
# .yml (feed auto-update) dan installer harus selalu diupload BERSAMAAN.
# Kalau salah satu ketinggalan, electron-updater di karyawan akan menunjuk
# ke versi yang tidak ada di server, atau karyawan tidak pernah dapat update.
#
# Pemakaian:
#   SSH_HOST=user@server SSH_PATH=/var/www/kolaborasi/public/downloads \
#     bash scripts/release.sh mac
#
#   Platform: mac | win | linux | all

set -e

PLATFORM="${1:-mac}"
SSH_HOST="${SSH_HOST:?Set SSH_HOST, contoh: collab-app@kolaborasi.adilabs.id}"
SSH_PATH="${SSH_PATH:-/var/www/kolaborasi/public/downloads}"

cd "$(dirname "$0")/.."

echo "=== [1/3] Build ($PLATFORM) ==="
case "$PLATFORM" in
  mac)   npx electron-builder --mac ;;
  win)   npx electron-builder --win ;;
  linux) npx electron-builder --linux ;;
  all)   npx electron-builder --mac --win --linux ;;
  *) echo "Platform tidak dikenal: $PLATFORM (pakai: mac|win|linux|all)"; exit 1 ;;
esac

echo ""
echo "=== [2/3] Upload artefak ke $SSH_HOST:$SSH_PATH ==="
# rsync HANYA file rilis final — bukan folder *-unpacked (jauh lebih besar,
# itu hasil ekstraksi mentah sebelum dikemas, bukan yang diunduh karyawan)
rsync -avz --progress \
  --include='*.dmg' --include='*.zip' --include='*.exe' --include='*.AppImage' \
  --include='*.blockmap' --include='latest*.yml' \
  --exclude='*' \
  dist/ "$SSH_HOST:$SSH_PATH/"

echo ""
echo "=== [3/3] Selesai ==="
echo "Versi yang dirilis: $(node -p "require('./package.json').version")"
echo "Karyawan yang app-nya sudah terpasang akan menerima update dalam ≤4 jam"
echo "(pengecekan berkala) atau langsung saat mereka buka menu tray > Cek Update."

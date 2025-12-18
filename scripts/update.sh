#!/bin/bash

# =====================================================
# QUICK UPDATE SCRIPT
# Use this for subsequent deployments after initial setup
# =====================================================

set -e

APP_NAME="kolaborasi"
APP_DIR="/var/www/${APP_NAME}"
BRANCH="master"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🔄 Updating ${APP_NAME}...${NC}"
echo ""

cd ${APP_DIR}

# Pull latest changes
echo "Pulling latest changes..."
git fetch origin
git reset --hard origin/${BRANCH}

# Install any new dependencies
echo "Installing dependencies..."
npm install --production=false

# Rebuild application
echo "Building application..."
npm run build

# Restart PM2 process
echo "Restarting application..."
pm2 restart ${APP_NAME}

echo ""
echo -e "${GREEN}✅ Update complete!${NC}"
echo ""
pm2 status ${APP_NAME}

#!/bin/bash

# =====================================================
# UPDATE/REDEPLOY SCRIPT FOR WORKSPACE COLLABORATION
# Use this for updates after initial deployment
# =====================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
APP_NAME="kolaborasi"
APP_DIR="/var/www/${APP_NAME}"
BRANCH="yapinet"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🔄 WORKSPACE COLLABORATION - UPDATE SCRIPT              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run with sudo"
    exit 1
fi

cd ${APP_DIR}

# Step 1: Backup current .env
log_info "Backing up .env file..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Step 2: Pull latest changes
log_info "Pulling latest changes from ${BRANCH}..."
git fetch origin
git reset --hard origin/${BRANCH}
git clean -fd
log_success "Repository updated"

# Step 3: Restore .env
log_info "Restoring .env file..."
LATEST_BACKUP=$(ls -t .env.backup.* 2>/dev/null | head -1)
if [ -n "$LATEST_BACKUP" ]; then
    cp "$LATEST_BACKUP" .env
    log_success ".env restored from backup"
fi

# Step 4: Install dependencies
log_info "Installing dependencies..."
yarn install --production=false --frozen-lockfile 2>/dev/null || yarn install --production=false
log_success "Dependencies updated"

# Step 5: Build
log_info "Building application..."
yarn build
log_success "Build completed"

# Step 6: Run migrations (if any)
log_info "Running database migrations..."
yarn db:migrate 2>/dev/null || log_warning "No new migrations"

# Step 7: Reload PM2 (zero-downtime)
log_info "Reloading application..."
pm2 reload ${APP_NAME}
log_success "Application reloaded"

# Done
echo ""
echo -e "${GREEN}✅ Update completed successfully!${NC}"
echo ""
pm2 status ${APP_NAME}
echo ""

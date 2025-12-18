#!/bin/bash

# =====================================================
# AUTO DEPLOY SCRIPT FOR WORKSPACE COLLABORATION APP
# Target: Biznet Gio VPS + Hostinger Domain
# Domain: kolaborasi.adilabs.id
# =====================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="kolaborasi"
APP_DIR="/var/www/${APP_NAME}"
REPO_URL="https://github.com/YOUR_USERNAME/kolaborasi.git"  # UPDATE THIS!
BRANCH="master"
NODE_VERSION="18"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Header
echo ""
echo "============================================="
echo "  🚀 Workspace Collaboration Auto Deploy"
echo "============================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Please run this script with sudo"
    exit 1
fi

# Step 1: Update system
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
log_success "System updated"

# Step 2: Install Node.js if not present
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    log_success "Node.js installed: $(node -v)"
else
    log_info "Node.js already installed: $(node -v)"
fi

# Step 3: Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
    log_success "PM2 installed"
else
    log_info "PM2 already installed"
fi

# Step 4: Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    log_info "Installing Nginx..."
    apt-get install -y nginx
    systemctl enable nginx
    log_success "Nginx installed"
else
    log_info "Nginx already installed"
fi

# Step 5: Create app directory
log_info "Setting up application directory..."
mkdir -p ${APP_DIR}
cd ${APP_DIR}

# Step 6: Clone or pull repository
if [ -d "${APP_DIR}/.git" ]; then
    log_info "Pulling latest changes from ${BRANCH}..."
    git fetch origin
    git reset --hard origin/${BRANCH}
else
    log_info "Cloning repository..."
    git clone -b ${BRANCH} ${REPO_URL} .
fi
log_success "Repository ready"

# Step 7: Check for .env file
if [ ! -f "${APP_DIR}/.env" ]; then
    log_warning ".env file not found!"
    log_info "Creating .env from .env.example..."
    cp .env.example .env
    log_warning "Please edit ${APP_DIR}/.env with your production values!"
    echo ""
    echo "Required environment variables:"
    echo "  - MONGO_URL: Your MongoDB connection string"
    echo "  - JWT_SECRET: A secure random string (min 32 chars)"
    echo "  - NEXT_PUBLIC_BASE_URL: https://kolaborasi.adilabs.id"
    echo "  - CORS_ORIGINS: https://kolaborasi.adilabs.id"
    echo "  - NODE_ENV: production"
    echo ""
    read -p "Press Enter after you've configured .env, or Ctrl+C to exit..."
fi

# Validate required env vars
source ${APP_DIR}/.env 2>/dev/null || true
if [ -z "$MONGO_URL" ] || [ -z "$JWT_SECRET" ]; then
    log_error "MONGO_URL and JWT_SECRET must be set in .env"
    exit 1
fi

# Step 8: Install dependencies
log_info "Installing dependencies..."
npm install --production=false
log_success "Dependencies installed"

# Step 9: Build application
log_info "Building application..."
npm run build
log_success "Build completed"

# Step 10: Create database indexes
log_info "Creating database indexes..."
node scripts/createIndexes.js || log_warning "Index creation skipped (may already exist)"

# Step 11: Setup PM2
log_info "Setting up PM2 process..."
pm2 delete ${APP_NAME} 2>/dev/null || true
pm2 start server.js --name ${APP_NAME} --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log_success "PM2 configured"

# Step 12: Configure Nginx
log_info "Configuring Nginx..."
cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINX_CONF'
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name kolaborasi.adilabs.id;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name kolaborasi.adilabs.id;

    # SSL Configuration (will be configured by certbot)
    # ssl_certificate /etc/letsencrypt/live/kolaborasi.adilabs.id/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/kolaborasi.adilabs.id/privkey.pem;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Socket.io specific
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # Static files caching
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000/_next/static/;
        proxy_cache_valid 60m;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }

    # Uploads
    location /uploads/ {
        alias /var/www/kolaborasi/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
NGINX_CONF

# Enable site
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test nginx config
nginx -t
systemctl reload nginx
log_success "Nginx configured"

# Step 13: Setup SSL with Certbot
if ! command -v certbot &> /dev/null; then
    log_info "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi

log_info "Setting up SSL certificate..."
echo ""
echo "To complete SSL setup, run:"
echo "  sudo certbot --nginx -d kolaborasi.adilabs.id"
echo ""

# Final status
echo ""
echo "============================================="
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "============================================="
echo ""
echo "Application Status:"
pm2 status ${APP_NAME}
echo ""
echo "Next Steps:"
echo "1. Configure DNS at Hostinger:"
echo "   - Type: A Record"
echo "   - Name: kolaborasi"
echo "   - Value: $(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo ""
echo "2. Setup SSL certificate:"
echo "   sudo certbot --nginx -d kolaborasi.adilabs.id"
echo ""
echo "3. Access your app at:"
echo "   https://kolaborasi.adilabs.id"
echo ""
echo "Useful commands:"
echo "  pm2 logs ${APP_NAME}     - View application logs"
echo "  pm2 restart ${APP_NAME}  - Restart application"
echo "  pm2 monit                - Monitor resources"
echo ""

#!/bin/bash

# =====================================================
# AUTO DEPLOY SCRIPT FOR WORKSPACE COLLABORATION APP
# Target: Biznet Gio VPS + PostgreSQL
# Domain: kolaborasi.adilabs.id
# Stack: Next.js + PostgreSQL + Socket.io
# Updated: December 2024
# =====================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE!
APP_NAME="kolaborasi"
APP_DIR="/var/www/${APP_NAME}"
DOMAIN="kolaborasi.adilabs.id"
REPO_URL="https://github.com/Adi-Sumardi/kolaborasi.git"
BRANCH="master"
NODE_VERSION="20"
PM2_INSTANCES="2"  # Number of PM2 instances (use "max" for all CPUs)

# Database Configuration
DB_NAME="workspace_collaboration"
DB_USER="workspace"
DB_PASS=""  # Will be generated if empty

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

log_step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

generate_password() {
    openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24
}

generate_jwt_secret() {
    openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64
}

# Header
clear
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║   🚀 WORKSPACE COLLABORATION - AUTO DEPLOY SCRIPT         ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║   Stack: Next.js + PostgreSQL + Socket.io                 ║${NC}"
echo -e "${CYAN}║   Target: Biznet Gio VPS                                  ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Please run this script with sudo"
    echo "Usage: sudo bash deploy.sh"
    exit 1
fi

# Get VPS IP
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "YOUR_VPS_IP")

echo -e "VPS IP Address: ${GREEN}${VPS_IP}${NC}"
echo -e "Target Domain:  ${GREEN}${DOMAIN}${NC}"
echo ""

# =====================================================
# STEP 1: System Update
# =====================================================
log_step "STEP 1/12: Updating System Packages"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
apt-get install -y -qq curl git build-essential openssl
log_success "System packages updated"

# =====================================================
# STEP 2: Install Node.js
# =====================================================
log_step "STEP 2/12: Installing Node.js ${NODE_VERSION}"

if command -v node &> /dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$CURRENT_NODE" -ge "${NODE_VERSION}" ]; then
        log_info "Node.js already installed: $(node -v)"
    else
        log_info "Upgrading Node.js from v${CURRENT_NODE} to v${NODE_VERSION}..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    fi
else
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi
log_success "Node.js ready: $(node -v)"

# =====================================================
# STEP 3: Install Yarn & PM2
# =====================================================
log_step "STEP 3/12: Installing Yarn & PM2"

# Install Yarn
if ! command -v yarn &> /dev/null; then
    log_info "Installing Yarn..."
    npm install -g yarn
fi
log_success "Yarn ready: $(yarn -v)"

# Install PM2
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
fi
log_success "PM2 ready: $(pm2 -v)"

# =====================================================
# STEP 4: Install & Configure PostgreSQL
# =====================================================
log_step "STEP 4/12: Installing & Configuring PostgreSQL"

if ! command -v psql &> /dev/null; then
    log_info "Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
    log_success "PostgreSQL installed"
else
    log_info "PostgreSQL already installed"
    systemctl start postgresql 2>/dev/null || true
fi

# Generate password if not set
if [ -z "$DB_PASS" ]; then
    DB_PASS=$(generate_password)
    log_info "Generated database password"
fi

# Create database and user
log_info "Setting up PostgreSQL database..."
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

# Enable UUID extension
sudo -u postgres psql -d ${DB_NAME} -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 2>/dev/null || true

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
log_success "PostgreSQL configured"

# =====================================================
# STEP 5: Install Nginx
# =====================================================
log_step "STEP 5/12: Installing Nginx"

if ! command -v nginx &> /dev/null; then
    log_info "Installing Nginx..."
    apt-get install -y nginx
    systemctl enable nginx
fi
systemctl start nginx
log_success "Nginx ready"

# =====================================================
# STEP 6: Setup Application Directory
# =====================================================
log_step "STEP 6/12: Setting Up Application Directory"

mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/public/uploads/jobdesk-attachments
mkdir -p ${APP_DIR}/public/uploads/profile-photos
chown -R www-data:www-data ${APP_DIR}/public/uploads

cd ${APP_DIR}

# Clone or pull repository
if [ -d "${APP_DIR}/.git" ]; then
    log_info "Pulling latest changes from ${BRANCH}..."
    git fetch origin
    git reset --hard origin/${BRANCH}
    git clean -fd
else
    if [ "$REPO_URL" = "https://github.com/YOUR_USERNAME/kolaborasi.git" ]; then
        log_error "Please update REPO_URL in this script!"
        log_info "Edit line 24: REPO_URL=\"https://github.com/YOUR_USERNAME/kolaborasi.git\""
        exit 1
    fi
    log_info "Cloning repository..."
    git clone -b ${BRANCH} ${REPO_URL} .
fi
log_success "Repository ready"

# =====================================================
# STEP 7: Configure Environment Variables
# =====================================================
log_step "STEP 7/12: Configuring Environment Variables"

JWT_SECRET=$(generate_jwt_secret)

# Create .env file
cat > ${APP_DIR}/.env << ENVFILE
# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=${DATABASE_URL}

# Authentication
JWT_SECRET=${JWT_SECRET}

# URLs
NEXT_PUBLIC_BASE_URL=https://${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}

# Push Notifications (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_MAILTO=mailto:admin@${DOMAIN}
ENVFILE

log_success "Environment variables configured"
log_warning "Note: VAPID keys for push notifications need to be generated manually"
echo "  Run: npx web-push generate-vapid-keys"

# =====================================================
# STEP 8: Install Dependencies
# =====================================================
log_step "STEP 8/12: Installing Dependencies"

log_info "Installing npm packages..."
yarn install --production=false --frozen-lockfile 2>/dev/null || yarn install --production=false
log_success "Dependencies installed"

# =====================================================
# STEP 9: Build Application
# =====================================================
log_step "STEP 9/12: Building Application"

log_info "Building Next.js application..."
yarn build
log_success "Build completed"

# =====================================================
# STEP 10: Database Migration & Seeding
# =====================================================
log_step "STEP 10/12: Database Migration & Seeding"

log_info "Running database migrations..."
yarn db:migrate || log_warning "Migration may have already been applied"

log_info "Seeding database with initial data..."
yarn seed 2>/dev/null || log_warning "Seeding skipped (data may already exist)"

log_success "Database ready"

# =====================================================
# STEP 11: Configure PM2
# =====================================================
log_step "STEP 11/12: Configuring PM2 Process Manager"

# Create PM2 ecosystem file
cat > ${APP_DIR}/ecosystem.config.js << 'PM2CONFIG'
module.exports = {
  apps: [{
    name: 'kolaborasi',
    script: 'server.js',
    instances: process.env.PM2_INSTANCES || 2,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/kolaborasi-error.log',
    out_file: '/var/log/pm2/kolaborasi-out.log',
    log_file: '/var/log/pm2/kolaborasi-combined.log',
    time: true,
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
PM2CONFIG

# Create log directory
mkdir -p /var/log/pm2
chown -R www-data:www-data /var/log/pm2

# Stop existing process
pm2 delete ${APP_NAME} 2>/dev/null || true

# Start with ecosystem file
cd ${APP_DIR}
PM2_INSTANCES=${PM2_INSTANCES} pm2 start ecosystem.config.js

# Save PM2 process list and setup startup
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

log_success "PM2 configured with ${PM2_INSTANCES} instances"

# =====================================================
# STEP 12: Configure Nginx
# =====================================================
log_step "STEP 12/12: Configuring Nginx"

cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINXCONF'
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Upstream for load balancing
upstream kolaborasi_upstream {
    least_conn;
    server 127.0.0.1:3000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name kolaborasi.adilabs.id;

    # Allow certbot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kolaborasi.adilabs.id;

    # SSL Configuration (will be configured by certbot)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # HSTS (uncomment after SSL is working)
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml application/rss+xml application/atom+xml image/svg+xml;

    # Client settings
    client_max_body_size 20M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy settings
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_request_buffering off;

    # Main application
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://kolaborasi_upstream;
        proxy_cache_bypass $http_upgrade;
    }

    # Login endpoint with stricter rate limiting
    location /api/auth/login {
        limit_req zone=login_limit burst=5 nodelay;
        proxy_pass http://kolaborasi_upstream;
    }

    # Socket.io WebSocket
    location /socket.io/ {
        proxy_pass http://kolaborasi_upstream;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Static files - Next.js
    location /_next/static/ {
        proxy_pass http://kolaborasi_upstream;
        proxy_cache_valid 200 60d;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }

    # Public static files
    location /icons/ {
        alias /var/www/kolaborasi/public/icons/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Uploads directory
    location /uploads/ {
        alias /var/www/kolaborasi/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, no-transform";

        # Security for uploads
        location ~* \.(php|jsp|asp|aspx|cgi)$ {
            deny all;
        }
    }

    # Service Worker
    location /sw.js {
        proxy_pass http://kolaborasi_upstream;
        add_header Cache-Control "no-cache";
    }

    # Manifest
    location /manifest.json {
        proxy_pass http://kolaborasi_upstream;
        add_header Cache-Control "no-cache";
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://kolaborasi_upstream;
        access_log off;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ /\.env {
        deny all;
    }
}
NGINXCONF

# Enable site
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test and reload nginx
nginx -t
systemctl reload nginx
log_success "Nginx configured"

# =====================================================
# Install Certbot for SSL
# =====================================================
log_info "Installing Certbot for SSL..."
apt-get install -y certbot python3-certbot-nginx

# =====================================================
# DEPLOYMENT COMPLETE
# =====================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║   ✅ DEPLOYMENT COMPLETED SUCCESSFULLY!                   ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Application Status
echo -e "${CYAN}📊 Application Status:${NC}"
pm2 status
echo ""

# Credentials
echo -e "${CYAN}🔐 Database Credentials:${NC}"
echo "  Database: ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo "  Password: ${DB_PASS}"
echo "  URL:      ${DATABASE_URL}"
echo ""

echo -e "${CYAN}🔑 JWT Secret:${NC}"
echo "  ${JWT_SECRET}"
echo ""

# Save credentials to file
cat > ${APP_DIR}/CREDENTIALS.txt << CREDS
==========================================
WORKSPACE COLLABORATION - CREDENTIALS
Generated: $(date)
==========================================

DATABASE:
  Database: ${DB_NAME}
  User:     ${DB_USER}
  Password: ${DB_PASS}
  URL:      ${DATABASE_URL}

JWT_SECRET:
  ${JWT_SECRET}

VPS IP:
  ${VPS_IP}

DOMAIN:
  https://${DOMAIN}

==========================================
KEEP THIS FILE SECURE AND DELETE AFTER NOTING!
==========================================
CREDS

chmod 600 ${APP_DIR}/CREDENTIALS.txt
echo -e "${YELLOW}⚠️  Credentials saved to: ${APP_DIR}/CREDENTIALS.txt${NC}"
echo -e "${YELLOW}   Please save these and delete the file!${NC}"
echo ""

# Next Steps
echo -e "${CYAN}📋 Next Steps:${NC}"
echo ""
echo "1. Configure DNS at your domain registrar:"
echo "   Type: A Record"
echo "   Name: kolaborasi (or @ for root)"
echo "   Value: ${VPS_IP}"
echo ""
echo "2. Wait for DNS propagation (5-30 minutes)"
echo ""
echo "3. Setup SSL certificate:"
echo -e "   ${GREEN}sudo certbot --nginx -d ${DOMAIN}${NC}"
echo ""
echo "4. Generate VAPID keys for push notifications:"
echo "   cd ${APP_DIR} && npx web-push generate-vapid-keys"
echo "   Then add to .env file"
echo ""
echo "5. Test your application:"
echo "   https://${DOMAIN}"
echo ""

# Useful Commands
echo -e "${CYAN}🛠️  Useful Commands:${NC}"
echo "  pm2 logs ${APP_NAME}        - View application logs"
echo "  pm2 restart ${APP_NAME}     - Restart application"
echo "  pm2 reload ${APP_NAME}      - Zero-downtime reload"
echo "  pm2 monit                   - Monitor resources"
echo "  pm2 status                  - Check status"
echo ""
echo "  nginx -t                    - Test nginx config"
echo "  systemctl reload nginx      - Reload nginx"
echo ""
echo "  psql -U ${DB_USER} -d ${DB_NAME}  - Connect to database"
echo ""

# Default Login
echo -e "${CYAN}👤 Default Admin Login:${NC}"
echo "  Email:    admin@workspace.com"
echo "  Password: Password123"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Change admin password after first login!${NC}"
echo ""

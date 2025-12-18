#!/bin/bash

# =====================================================
# DATABASE BACKUP SCRIPT FOR WORKSPACE COLLABORATION
# Creates timestamped PostgreSQL backups
# =====================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DB_NAME="workspace_collaboration"
DB_USER="workspace"
BACKUP_DIR="/var/backups/kolaborasi"
RETENTION_DAYS=7

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo -e "${BLUE}[INFO]${NC} Creating database backup..."

# Create backup
PGPASSWORD="${DB_PASS}" pg_dump -U ${DB_USER} -h localhost ${DB_NAME} | gzip > ${BACKUP_FILE}

echo -e "${GREEN}[SUCCESS]${NC} Backup created: ${BACKUP_FILE}"

# Get backup size
SIZE=$(ls -lh ${BACKUP_FILE} | awk '{print $5}')
echo -e "${BLUE}[INFO]${NC} Backup size: ${SIZE}"

# Remove old backups
echo -e "${BLUE}[INFO]${NC} Removing backups older than ${RETENTION_DAYS} days..."
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo -e "${BLUE}[INFO]${NC} Current backups:"
ls -lh ${BACKUP_DIR}/*.sql.gz 2>/dev/null || echo "  No backups found"

echo ""
echo -e "${GREEN}✅ Backup completed!${NC}"

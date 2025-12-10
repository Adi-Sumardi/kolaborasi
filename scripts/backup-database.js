// Database Backup Script
// Run: node scripts/backup-database.js

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/workspace_collaboration';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;

// Create backup directory if not exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

console.log('🔄 Starting database backup...');
console.log(`📦 Backup location: ${backupPath}`);

// Execute mongodump command
const dumpCommand = `mongodump --uri="${MONGO_URL}" --out="${backupPath}"`;

exec(dumpCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
  }
  
  if (stderr) {
    console.error('⚠️  Backup stderr:', stderr);
  }
  
  console.log('✅ Backup completed successfully!');
  console.log(stdout);
  
  // Clean old backups
  cleanOldBackups();
});

// Clean old backups based on retention policy
function cleanOldBackups() {
  console.log('\n🧹 Cleaning old backups...');
  
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  
  let deletedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory() && file.startsWith('backup-')) {
      const age = now - stats.mtimeMs;
      
      if (age > retentionMs) {
        console.log(`🗑️  Deleting old backup: ${file} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
        fs.rmSync(filePath, { recursive: true, force: true });
        deletedCount++;
      }
    }
  });
  
  if (deletedCount === 0) {
    console.log('✅ No old backups to clean');
  } else {
    console.log(`✅ Cleaned ${deletedCount} old backup(s)`);
  }
}

// Show usage info
console.log(`
📋 Backup Configuration:
   - Database: ${MONGO_URL.split('@')[1] || MONGO_URL}
   - Backup Directory: ${BACKUP_DIR}
   - Retention: ${RETENTION_DAYS} days
   
🕐 To schedule automatic backups, add to crontab:
   0 2 * * * cd ${process.cwd()} && node scripts/backup-database.js >> logs/backup.log 2>&1
   
   (Runs daily at 2:00 AM)
`);

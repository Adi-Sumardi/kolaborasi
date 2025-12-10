// Database Restore Script
// Usage: node scripts/restore-database.js <backup-path>
// Example: node scripts/restore-database.js backups/backup-2025-12-10

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/workspace_collaboration';

// Get backup path from command line argument
const backupPath = process.argv[2];

if (!backupPath) {
  console.error('❌ Error: Please provide backup path');
  console.log('\nUsage: node scripts/restore-database.js <backup-path>');
  console.log('Example: node scripts/restore-database.js backups/backup-2025-12-10');
  process.exit(1);
}

// Check if backup exists
if (!fs.existsSync(backupPath)) {
  console.error(`❌ Error: Backup not found at ${backupPath}`);
  process.exit(1);
}

console.log('⚠️  WARNING: This will replace the current database!');
console.log(`📦 Restore from: ${backupPath}`);
console.log(`🎯 Target database: ${MONGO_URL.split('@')[1] || MONGO_URL}`);
console.log('\nStarting restore in 5 seconds... (Press Ctrl+C to cancel)');

// Countdown
let countdown = 5;
const countdownInterval = setInterval(() => {
  process.stdout.write(`\r${countdown}... `);
  countdown--;
  
  if (countdown < 0) {
    clearInterval(countdownInterval);
    process.stdout.write('\r');
    performRestore();
  }
}, 1000);

function performRestore() {
  console.log('\n🔄 Starting database restore...');
  
  const restoreCommand = `mongorestore --uri="${MONGO_URL}" --drop "${backupPath}"`;
  
  exec(restoreCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Restore failed:', error.message);
      process.exit(1);
    }
    
    if (stderr) {
      console.error('⚠️  Restore stderr:', stderr);
    }
    
    console.log('✅ Restore completed successfully!');
    console.log(stdout);
  });
}

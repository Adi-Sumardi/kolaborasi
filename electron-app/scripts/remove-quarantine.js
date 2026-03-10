const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  if (process.platform !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[afterPack] Removing quarantine attributes from: ${appPath}`);

  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] Quarantine attributes removed successfully');
  } catch (err) {
    console.warn('[afterPack] Failed to remove quarantine:', err.message);
  }
};

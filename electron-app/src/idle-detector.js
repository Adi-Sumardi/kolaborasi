const { powerMonitor } = require('electron');

const IDLE_THRESHOLD = 120; // 2 minutes in seconds
let checkInterval = null;
let isIdle = false;
let onIdleCallback = null;
let onActiveCallback = null;

function start(onIdle, onActive) {
  onIdleCallback = onIdle;
  onActiveCallback = onActive;

  // Check idle state every 5 seconds
  checkInterval = setInterval(() => {
    const idleTime = powerMonitor.getSystemIdleTime();

    if (idleTime >= IDLE_THRESHOLD && !isIdle) {
      isIdle = true;
      console.log(`[Idle] User idle (${idleTime}s)`);
      if (onIdleCallback) onIdleCallback();
    } else if (idleTime < IDLE_THRESHOLD && isIdle) {
      isIdle = false;
      console.log('[Idle] User active');
      if (onActiveCallback) onActiveCallback();
    }
  }, 5000);
}

function stop() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

module.exports = { start, stop };

const { io } = require('socket.io-client');

let socket = null;
let onConfigCallback = null;

function connect(serverUrl, token) {
  if (!serverUrl || !token) {
    console.log('[Socket] Missing serverUrl or token');
    return null;
  }

  if (socket?.connected) return socket;

  // Disconnect old socket if exists
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = io(serverUrl, {
    auth: { token, source: 'desktop-agent' },
    path: '/socket.io/',
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to server');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.log('[Socket] Connection error:', err.message);
  });

  // Listen for config changes from server (fps, quality)
  socket.on('agent:config', (config) => {
    console.log('[Socket] Received config:', config);
    if (onConfigCallback) {
      onConfigCallback(config);
    }
  });

  return socket;
}

function disconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

function getSocket() {
  return socket;
}

function emitScreenshot(buffer) {
  if (socket?.connected) {
    socket.emit('agent:screenshot', buffer);
  }
}

function emitIdle() {
  if (socket?.connected) {
    socket.emit('activity:idle');
  }
}

function emitActive() {
  if (socket?.connected) {
    socket.emit('activity:active');
  }
}

function onConfig(callback) {
  onConfigCallback = callback;
}

module.exports = {
  connect,
  disconnect,
  getSocket,
  emitScreenshot,
  emitIdle,
  emitActive,
  onConfig
};

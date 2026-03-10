const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Flag to detect Electron environment
  isElectron: true,

  // Notify main process when user logs in (called from web app's setToken)
  notifyLogin: (token, user) => {
    ipcRenderer.send('auth:login', { token, user });
  },

  // Notify main process when user logs out (called from web app's removeToken)
  notifyLogout: () => {
    ipcRenderer.send('auth:logout');
  },

  // Listen for agent status changes from main process
  onAgentStatus: (callback) => {
    ipcRenderer.on('agent:status', (_event, status) => callback(status));
  }
});

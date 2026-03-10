const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'kolaborasi-desktop-2024',
  schema: {
    serverUrl: { type: 'string', default: '' }
  }
});

module.exports = store;

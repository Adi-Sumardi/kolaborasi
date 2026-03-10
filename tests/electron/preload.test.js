/**
 * Tests for electron-app/preload.js
 *
 * Mocks Electron's contextBridge and ipcRenderer to verify that
 * the correct API surface is exposed to the renderer process.
 *
 * @jest-environment node
 */

// --- Mocks -------------------------------------------------------------------
// Electron mock is provided by moduleNameMapper in jest.config.js

let exposedApi = {};

const electron = require('electron');
const mockIpcRenderer = electron.ipcRenderer;

// Configure contextBridge mock to capture the exposed API
electron.contextBridge.exposeInMainWorld.mockImplementation((name, api) => {
  exposedApi = api;
});

// --- Import (triggers the module-level exposeInMainWorld call) ---------------

beforeAll(() => {
  require('../../electron-app/preload');
});

// --- Tests -------------------------------------------------------------------

describe('preload.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exposes electronAPI on window via contextBridge', () => {
    // The module was required in beforeAll, which called exposeInMainWorld.
    // Since beforeEach calls jest.clearAllMocks(), we verify the API was
    // captured correctly instead of checking mock call history.
    expect(exposedApi).toBeDefined();
    expect(exposedApi.isElectron).toBe(true);
    expect(typeof exposedApi.notifyLogin).toBe('function');
    expect(typeof exposedApi.notifyLogout).toBe('function');
    expect(typeof exposedApi.onAgentStatus).toBe('function');
  });

  test('electronAPI.isElectron is true', () => {
    expect(exposedApi.isElectron).toBe(true);
  });

  describe('notifyLogin', () => {
    test('sends auth:login IPC with token and user', () => {
      const user = { id: 1, email: 'test@example.com', role: 'karyawan' };
      exposedApi.notifyLogin('my-token', user);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('auth:login', {
        token: 'my-token',
        user,
      });
    });

    test('sends IPC each time it is called', () => {
      exposedApi.notifyLogin('tok1', { id: 1 });
      exposedApi.notifyLogin('tok2', { id: 2 });

      expect(mockIpcRenderer.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('notifyLogout', () => {
    test('sends auth:logout IPC', () => {
      exposedApi.notifyLogout();

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('auth:logout');
    });
  });

  describe('onAgentStatus', () => {
    test('registers ipcRenderer listener for agent:status', () => {
      const callback = jest.fn();
      exposedApi.onAgentStatus(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith('agent:status', expect.any(Function));
    });

    test('invokes the callback with status data when event fires', () => {
      const callback = jest.fn();
      exposedApi.onAgentStatus(callback);

      // Get the internal handler that was registered
      const registeredHandler = mockIpcRenderer.on.mock.calls.find(
        (c) => c[0] === 'agent:status'
      )[1];

      // Simulate the IPC event
      registeredHandler({}, 'connected');

      expect(callback).toHaveBeenCalledWith('connected');
    });

    test('passes different status values correctly', () => {
      const callback = jest.fn();
      exposedApi.onAgentStatus(callback);

      const handler = mockIpcRenderer.on.mock.calls.find(
        (c) => c[0] === 'agent:status'
      )[1];

      handler({}, 'disconnected');
      expect(callback).toHaveBeenCalledWith('disconnected');

      handler({}, 'monitoring');
      expect(callback).toHaveBeenCalledWith('monitoring');
    });
  });
});

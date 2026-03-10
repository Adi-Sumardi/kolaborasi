/**
 * Tests for lib/socket-client.js
 *
 * Mocks socket.io-client and lib/api so we can test initSocket / getSocket /
 * disconnectSocket in isolation.
 */

// --- mocks -------------------------------------------------------------------

const mockSocketInstance = {
  connected: true,
  disconnected: false,
  active: true,
  auth: { token: 'valid-token' },
  on: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocketInstance),
}));

jest.mock('../../lib/api', () => ({
  getToken: jest.fn(() => 'valid-token'),
}));

// --- imports (after mocks) ---------------------------------------------------

import { initSocket, getSocket, disconnectSocket } from '../../lib/socket-client';
import { io as ioClient } from 'socket.io-client';
import { getToken } from '../../lib/api';

// --- helpers -----------------------------------------------------------------

function resetSocketModule() {
  // disconnectSocket sets internal socket to null
  disconnectSocket();
  jest.clearAllMocks();
  // Restore default mock return values
  mockSocketInstance.connected = true;
  mockSocketInstance.disconnected = false;
  mockSocketInstance.active = true;
  mockSocketInstance.auth = { token: 'valid-token' };
  getToken.mockReturnValue('valid-token');
}

// --- tests -------------------------------------------------------------------

describe('socket-client', () => {
  beforeEach(() => {
    resetSocketModule();
  });

  describe('initSocket', () => {
    test('creates a socket connection with the token', () => {
      const socket = initSocket();

      expect(ioClient).toHaveBeenCalledTimes(1);
      const [url, opts] = ioClient.mock.calls[0];
      expect(opts.auth.token).toBe('valid-token');
      expect(opts.reconnection).toBe(true);
      expect(opts.reconnectionAttempts).toBe(5);
      expect(socket).toBe(mockSocketInstance);
    });

    test('returns null and disconnects existing socket when no token', () => {
      // First create a socket
      initSocket();
      jest.clearAllMocks();

      // Now remove the token
      getToken.mockReturnValue(null);
      const socket = initSocket();

      expect(socket).toBeNull();
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
    });

    test('returns existing socket if still connected', () => {
      const first = initSocket();
      jest.clearAllMocks();

      const second = initSocket();
      // Should NOT create a new connection
      expect(ioClient).not.toHaveBeenCalled();
      expect(second).toBe(first);
    });

    test('recreates socket if dead (disconnected and not active)', () => {
      initSocket();
      jest.clearAllMocks();

      // Simulate dead socket
      mockSocketInstance.disconnected = true;
      mockSocketInstance.active = false;

      initSocket();
      expect(mockSocketInstance.removeAllListeners).toHaveBeenCalled();
      expect(ioClient).toHaveBeenCalledTimes(1);
    });

    test('reconnects if token changed', () => {
      initSocket();
      jest.clearAllMocks();

      // Change token
      getToken.mockReturnValue('new-token');

      initSocket();
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
      expect(ioClient).toHaveBeenCalledTimes(1);
      expect(ioClient.mock.calls[0][1].auth.token).toBe('new-token');
    });

    test('registers connect, disconnect, and connect_error listeners', () => {
      initSocket();

      const registeredEvents = mockSocketInstance.on.mock.calls.map((c) => c[0]);
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('disconnect');
      expect(registeredEvents).toContain('connect_error');
    });
  });

  describe('getSocket', () => {
    test('returns null before initSocket is called', () => {
      expect(getSocket()).toBeNull();
    });

    test('returns the socket after initSocket', () => {
      initSocket();
      expect(getSocket()).toBe(mockSocketInstance);
    });
  });

  describe('disconnectSocket', () => {
    test('disconnects and nullifies the socket', () => {
      initSocket();
      disconnectSocket();

      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
      expect(getSocket()).toBeNull();
    });

    test('is safe to call when no socket exists', () => {
      expect(() => disconnectSocket()).not.toThrow();
    });
  });

  describe('connect_error handler', () => {
    test('disconnects on authentication error', () => {
      initSocket();

      // Find the connect_error handler
      const errorCall = mockSocketInstance.on.mock.calls.find((c) => c[0] === 'connect_error');
      expect(errorCall).toBeDefined();

      const handler = errorCall[1];

      // Simulate auth error
      handler(new Error('Authentication error'));
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
    });

    test('does not disconnect on websocket error', () => {
      initSocket();

      // Find the handler BEFORE clearing mocks (clearAllMocks wipes mock.calls)
      const errorCall = mockSocketInstance.on.mock.calls.find((c) => c[0] === 'connect_error');
      expect(errorCall).toBeDefined();
      const handler = errorCall[1];

      jest.clearAllMocks();

      handler(new Error('websocket error'));
      expect(mockSocketInstance.disconnect).not.toHaveBeenCalled();
    });
  });
});

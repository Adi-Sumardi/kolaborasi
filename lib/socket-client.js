import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

export const initSocket = () => {
  if (socket && socket.connected) {
    return socket;
  }

  const token = getToken();
  if (!token) {
    console.log('No token available for socket connection');
    return null;
  }

  try {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
      auth: {
        token
      },
      transports: ['polling', 'websocket'], // Try polling first
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      // Silently handle connection errors - don't spam console
      if (error.message !== 'websocket error') {
        console.warn('Socket connection issue (non-critical):', error.message);
      }
    });

    return socket;
  } catch (error) {
    console.error('Failed to initialize socket:', error);
    return null;
  }
};

export const getSocket = () => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

export const initSocket = () => {
  const token = getToken();
  
  // If no token, disconnect existing socket
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    console.log('No token available for socket connection');
    return null;
  }

  // If socket exists but with different token, reconnect
  if (socket && socket.connected) {
    // Check if we need to reconnect with new token
    if (socket.auth && socket.auth.token !== token) {
      socket.disconnect();
      socket = null;
    } else {
      return socket;
    }
  }

  try {
    // Use the same base URL as the app for WebSocket connection
    const socketUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
    
    socket = io(socketUrl, {
      auth: {
        token
      },
      path: '/socket.io/',
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      // Handle authentication errors gracefully
      if (error.message.includes('Authentication error') || error.message.includes('jwt')) {
        console.warn('Socket authentication failed - token may be expired');
        // Disconnect and don't retry with bad token
        if (socket) {
          socket.disconnect();
          socket = null;
        }
      } else if (error.message !== 'websocket error') {
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

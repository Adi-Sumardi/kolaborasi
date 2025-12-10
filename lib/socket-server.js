import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initSocketServer = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/socket.io/'
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userEmail}`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join chat room
    socket.on('join_room', (roomId) => {
      socket.join(`room:${roomId}`);
      console.log(`${socket.userEmail} joined room: ${roomId}`);
    });

    // Leave chat room
    socket.on('leave_room', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // Send message
    socket.on('send_message', (data) => {
      io.to(`room:${data.roomId}`).emit('new_message', data);
    });

    // Typing indicator
    socket.on('typing', (data) => {
      socket.to(`room:${data.roomId}`).emit('user_typing', {
        userId: socket.userId,
        email: socket.userEmail
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userEmail}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const sendNotification = (userId, notification) => {
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
  }
};
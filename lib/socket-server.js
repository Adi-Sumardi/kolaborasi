import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initSocketServer = (server) => {
  if (io) return io;

  const dev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = dev
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : [process.env.NEXT_PUBLIC_BASE_URL].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
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

  // In-memory store for employee activity data
  // userId -> { status, page, pageLabel, onlineSince, lastActivity }
  const employeeActivity = new Map();

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userEmail} (ID: ${socket.userId}) role: ${socket.userRole}`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Auto-track activity for karyawan/sdm on connect
    if (['karyawan', 'sdm'].includes(socket.userRole)) {
      console.log(`📊 Auto-tracking: ${socket.userEmail} is now online`);
      employeeActivity.set(socket.userId, {
        status: 'online',
        page: 'home',
        pageLabel: 'Dashboard',
        onlineSince: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    }

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

    // WebRTC Signaling for screen monitoring
    socket.on('monitor:offer', (data) => {
      // Admin sends offer to employee
      io.to(`user:${data.targetUserId}`).emit('monitor:offer', {
        offer: data.offer,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:answer', (data) => {
      // Employee sends answer back to admin
      io.to(`user:${data.targetUserId}`).emit('monitor:answer', {
        answer: data.answer,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:ice-candidate', (data) => {
      // Exchange ICE candidates
      io.to(`user:${data.targetUserId}`).emit('monitor:ice-candidate', {
        candidate: data.candidate,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:screen-available', (data) => {
      // Employee notifies that screen share is available
      io.emit('monitor:employee-online', {
        userId: socket.userId,
        available: true
      });
    });

    socket.on('monitor:screen-unavailable', () => {
      io.emit('monitor:employee-online', {
        userId: socket.userId,
        available: false
      });
    });

    // --- Activity Tracking Events ---
    socket.on('activity:online', (data) => {
      console.log(`📊 Activity:online from ${socket.userEmail} - page: ${data.pageLabel}`);
      employeeActivity.set(socket.userId, {
        status: 'online',
        page: data.page || 'home',
        pageLabel: data.pageLabel || 'Dashboard',
        onlineSince: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    socket.on('activity:page-change', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: existing.status === 'idle' ? 'idle' : 'online',
        page: data.page,
        pageLabel: data.pageLabel,
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    socket.on('activity:idle', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'idle',
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    socket.on('activity:active', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    // Admin requests all current activity data
    socket.on('activity:request-all', () => {
      const allActivity = {};
      employeeActivity.forEach((value, key) => {
        allActivity[key] = value;
      });
      socket.emit('activity:all-data', allActivity);
    });

    // Admin joins monitor room
    socket.on('activity:join-monitor', () => {
      socket.join('room:admin-monitor');
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userEmail}`);

      // Mark as offline in activity store
      if (employeeActivity.has(socket.userId)) {
        employeeActivity.set(socket.userId, {
          ...employeeActivity.get(socket.userId),
          status: 'offline',
          lastActivity: new Date().toISOString()
        });
        io.to('room:admin-monitor').emit('activity:update', {
          userId: socket.userId,
          ...employeeActivity.get(socket.userId)
        });
      }

      // Existing: broadcast screen unavailable
      io.emit('monitor:employee-online', { userId: socket.userId, available: false });
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
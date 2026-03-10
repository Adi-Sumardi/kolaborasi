require('dotenv').config();
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ===========================================
// ENVIRONMENT VALIDATION
// ===========================================
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ FATAL ERROR: Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  console.error('\nPlease set these environment variables before starting the server.');
  console.error('See .env.example for reference.');
  process.exit(1);
}

// Validate JWT_SECRET strength in production
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL ERROR: JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

// ===========================================
// SERVER CONFIGURATION
// ===========================================
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

// Log configuration on startup
console.log('===========================================');
console.log('🚀 Starting Workspace Collaboration Server');
console.log('===========================================');
console.log(`Environment: ${dev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`Host: ${hostname}`);
console.log(`Port: ${port}`);
console.log(`Base URL: ${process.env.NEXT_PUBLIC_BASE_URL || 'Not set'}`);
console.log('===========================================\n');

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // Apply security headers
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        },
        frameguard: { action: 'deny' },
        xssFilter: true,
        noSniff: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
      })(req, res, () => {});
      
      // Apply compression
      compression()(req, res, () => {});
      
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });
  
  // Register graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Initialize Socket.IO
  const allowedOrigins = dev
    ? ['http://localhost:3000', 'http://0.0.0.0:3000', 'http://127.0.0.1:3000']
    : [process.env.NEXT_PUBLIC_BASE_URL].filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow connections with no origin (desktop agent, mobile apps)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io/',
    maxHttpBufferSize: 500 * 1024 // 500KB for screenshot binary
  });

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userRole = decoded.role;
      socket.source = socket.handshake.auth.source || 'browser';
      next();
    } catch (err) {
      console.error('Socket auth error:', err.message);
      next(new Error('Authentication error'));
    }
  });

  // In-memory store for employee activity
  const employeeActivity = new Map();

  // Socket.IO connection handler
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userEmail} (role: ${socket.userRole}, source: ${socket.source})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Auto-track activity for karyawan/sdm on connect (server-side, no client emit needed)
    if (['karyawan', 'sdm'].includes(socket.userRole)) {
      console.log(`📊 ${socket.userEmail} auto-tracked as online (source: ${socket.source})`);
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        page: existing.page || 'home',
        pageLabel: existing.pageLabel || 'Dashboard',
        agentConnected: socket.source === 'desktop-agent' ? true : (existing.agentConnected || false),
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
      io.to(`user:${data.targetUserId}`).emit('monitor:offer', {
        offer: data.offer,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:answer', (data) => {
      io.to(`user:${data.targetUserId}`).emit('monitor:answer', {
        answer: data.answer,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:ice-candidate', (data) => {
      io.to(`user:${data.targetUserId}`).emit('monitor:ice-candidate', {
        candidate: data.candidate,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    // Start working (from WelcomeWorkModal)
    socket.on('activity:start-working', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        mood: data.mood || 'biasa',
        workStartedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
      console.log(`🏢 ${socket.userEmail} started working (mood: ${data.mood})`);
    });

    // Work Session: Clock-in (from Electron or browser)
    socket.on('worksession:clock-in', async (data) => {
      if (!['karyawan', 'sdm'].includes(socket.userRole)) return;

      try {
        // Check for existing open session
        const existing = await dbPool.query(
          'SELECT id FROM work_sessions WHERE user_id = $1 AND clock_out IS NULL',
          [socket.userId]
        );

        if (existing.rows.length === 0) {
          await dbPool.query(
            'INSERT INTO work_sessions (user_id, clock_in, mood, source, date) VALUES ($1, NOW(), $2, $3, CURRENT_DATE)',
            [socket.userId, data?.mood || null, data?.source || socket.source]
          );
          console.log(`⏰ ${socket.userEmail} clocked in (${data?.source || socket.source})`);
        }

        // Update activity map
        const ea = employeeActivity.get(socket.userId) || {};
        employeeActivity.set(socket.userId, {
          ...ea,
          workSessionActive: true,
          workClockIn: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        });

        io.to('room:admin-monitor').emit('activity:update', {
          userId: socket.userId,
          ...employeeActivity.get(socket.userId)
        });

        socket.emit('worksession:session-started', { clockIn: new Date().toISOString() });
      } catch (err) {
        console.error('[WorkSession] Clock-in error:', err.message);
      }
    });

    // Work Session: Clock-out
    socket.on('worksession:clock-out', async () => {
      if (!['karyawan', 'sdm'].includes(socket.userRole)) return;

      try {
        const result = await dbPool.query(
          `UPDATE work_sessions
           SET clock_out = NOW(), duration_minutes = EXTRACT(EPOCH FROM (NOW() - clock_in)) / 60
           WHERE user_id = $1 AND clock_out IS NULL RETURNING duration_minutes`,
          [socket.userId]
        );

        if (result.rows.length > 0) {
          const mins = Math.round(result.rows[0].duration_minutes);
          console.log(`⏰ ${socket.userEmail} clocked out (${Math.floor(mins/60)}h ${mins%60}m)`);
        }

        // Update activity map
        const ea = employeeActivity.get(socket.userId) || {};
        employeeActivity.set(socket.userId, {
          ...ea,
          workSessionActive: false,
          lastActivity: new Date().toISOString()
        });

        io.to('room:admin-monitor').emit('activity:update', {
          userId: socket.userId,
          ...employeeActivity.get(socket.userId)
        });
      } catch (err) {
        console.error('[WorkSession] Clock-out error:', err.message);
      }
    });

    // Screen share ready/stopped (from "Mulai Bekerja" / "Selesai Bekerja")
    socket.on('monitor:screen-ready', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, { ...existing, screenReady: true, lastActivity: new Date().toISOString() });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
      console.log(`🖥️ ${socket.userEmail} screen share ready`);
    });

    socket.on('monitor:screen-stopped', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, { ...existing, screenReady: false, lastActivity: new Date().toISOString() });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
      console.log(`🖥️ ${socket.userEmail} screen share stopped`);
    });

    // --- Desktop Agent Events ---

    // Agent sends screenshot frame (binary buffer)
    socket.on('agent:screenshot', (frameBuffer) => {
      if (socket.source !== 'desktop-agent') return;
      // Relay screenshot ONLY to admins currently watching this employee
      io.to(`monitor:${socket.userId}`).emit('agent:frame', {
        userId: socket.userId,
        frame: frameBuffer,
        timestamp: Date.now()
      });
    });

    // Admin subscribes to employee's desktop stream
    socket.on('agent:watch', (data) => {
      if (!['super_admin', 'owner'].includes(socket.userRole)) return;
      socket.join(`monitor:${data.targetUserId}`);
      // Tell agent to start capturing
      io.to(`user:${data.targetUserId}`).emit('agent:config', {
        fps: data.fps || 1,
        quality: data.quality || 60
      });
      console.log(`👁️ ${socket.userEmail} started watching ${data.targetUserId}`);
    });

    // Admin stops watching
    socket.on('agent:unwatch', (data) => {
      socket.leave(`monitor:${data.targetUserId}`);
      // If no more watchers, tell agent to stop capturing
      const room = io.sockets.adapter.rooms.get(`monitor:${data.targetUserId}`);
      if (!room || room.size === 0) {
        io.to(`user:${data.targetUserId}`).emit('agent:config', { fps: 0 });
      }
      console.log(`👁️ ${socket.userEmail} stopped watching ${data.targetUserId}`);
    });

    // Activity Tracking Events (from client ActivityTracker)
    socket.on('activity:online', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        page: data.page || existing.page || 'home',
        pageLabel: data.pageLabel || existing.pageLabel || 'Dashboard',
        onlineSince: existing.onlineSince || new Date().toISOString(),
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
      employeeActivity.set(socket.userId, { ...existing, status: 'idle', lastActivity: new Date().toISOString() });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    socket.on('activity:active', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, { ...existing, status: 'online', lastActivity: new Date().toISOString() });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
    });

    socket.on('activity:request-all', () => {
      const allActivity = {};
      employeeActivity.forEach((value, key) => { allActivity[key] = value; });
      socket.emit('activity:all-data', allActivity);
    });

    socket.on('activity:join-monitor', () => {
      socket.join('room:admin-monitor');
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userEmail} (source: ${socket.source})`);

      // Mark as offline in activity store
      if (employeeActivity.has(socket.userId)) {
        const updates = {
          ...employeeActivity.get(socket.userId),
          lastActivity: new Date().toISOString()
        };

        if (socket.source === 'desktop-agent') {
          // Desktop agent disconnected — mark agent as offline but keep browser status
          updates.agentConnected = false;
        } else {
          // Browser disconnected — mark as offline
          updates.status = 'offline';
          updates.screenReady = false;
        }

        employeeActivity.set(socket.userId, updates);
        io.to('room:admin-monitor').emit('activity:update', {
          userId: socket.userId,
          ...employeeActivity.get(socket.userId)
        });
      }

      // Auto clock-out if no more sockets for this user
      const userRoom = io.sockets.adapter.rooms.get(`user:${socket.userId}`);
      if (!userRoom || userRoom.size === 0) {
        try {
          const result = await dbPool.query(
            `UPDATE work_sessions
             SET clock_out = NOW(), duration_minutes = EXTRACT(EPOCH FROM (NOW() - clock_in)) / 60
             WHERE user_id = $1 AND clock_out IS NULL RETURNING duration_minutes`,
            [socket.userId]
          );
          if (result.rows.length > 0) {
            console.log(`⏰ ${socket.userEmail} auto clock-out (disconnect, no remaining sockets)`);
          }
        } catch (err) {
          console.error('[WorkSession] Auto clock-out error:', err.message);
        }
      }
    });
  });

  // Make io accessible globally
  global.io = io;

  server
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.io enabled on port ${port}`);
    });
});

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const compression = require('compression');

// ===========================================
// ENVIRONMENT VALIDATION
// ===========================================
const requiredEnvVars = ['MONGO_URL', 'JWT_SECRET'];
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
  const io = new Server(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io/'
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
      next();
    } catch (err) {
      console.error('Socket auth error:', err.message);
      next(new Error('Authentication error'));
    }
  });

  // Socket.IO connection handler
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userEmail} (ID: ${socket.userId})`);

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
      console.log(`${socket.userEmail} left room: ${roomId}`);
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

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userEmail}`);
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

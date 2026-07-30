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

// WAJIB: tanpa handler ini, error pada idle client (DB restart / blip jaringan)
// menjadi unhandled 'error' event dan mematikan seluruh proses Node.
dbPool.on('error', (err) => {
  console.error('[DB Pool] Idle client error (proses tetap hidup):', err.message);
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
  // Origin yang diizinkan. Di produksi jangan hanya andalkan NEXT_PUBLIC_BASE_URL —
  // akses lewat IP langsung atau varian www/non-www akan gagal connect.
  // Tambahan bisa diisi lewat env CORS_ORIGINS (dipisah koma).
  const buildAllowedOrigins = () => {
    if (dev) {
      return [
        `http://localhost:${port}`, `http://0.0.0.0:${port}`, `http://127.0.0.1:${port}`,
        'http://localhost:3000', 'http://0.0.0.0:3000', 'http://127.0.0.1:3000',
      ];
    }

    const origins = new Set();
    const add = (value) => {
      if (!value) return;
      const url = value.trim().replace(/\/+$/, '');
      if (!url) return;
      origins.add(url);
      // Terima juga varian www <-> non-www dari host yang sama
      try {
        const parsed = new URL(url);
        const host = parsed.host.startsWith('www.')
          ? parsed.host.slice(4)
          : `www.${parsed.host}`;
        origins.add(`${parsed.protocol}//${host}`);
      } catch {
        // bukan URL valid, abaikan
      }
    };

    add(process.env.NEXT_PUBLIC_BASE_URL);
    (process.env.CORS_ORIGINS || '').split(',').forEach(add);
    return [...origins];
  };

  const allowedOrigins = buildAllowedOrigins();
  console.log(`🔐 Socket.IO allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow connections with no origin (desktop agent, mobile apps)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin.replace(/\/+$/, ''))) return callback(null, true);
        console.warn(`🚫 Socket CORS ditolak untuk origin: ${origin}`);
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

  // Active monitor sessions: sessionId -> { adminId, employeeId }
  // Diisi saat admin mengirim offer yang lolos validasi DB, dipakai untuk
  // memverifikasi answer & ICE candidate agar tidak bisa dipalsukan user lain.
  const monitorSessions = new Map();

  const ADMIN_ROLES = ['super_admin', 'owner'];
  const isAdmin = (role) => ADMIN_ROLES.includes(role);

  // Buang entri aktivitas karyawan yang sudah lama offline supaya Map tidak
  // tumbuh selamanya (user nonaktif/terhapus tidak pernah connect lagi).
  const ACTIVITY_TTL = 24 * 60 * 60 * 1000; // 24 jam
  const evictStaleActivity = () => {
    const now = Date.now();
    let removed = 0;
    for (const [userId, activity] of employeeActivity.entries()) {
      if (activity.status !== 'offline') continue;
      const last = new Date(activity.lastActivity || 0).getTime();
      if (now - last > ACTIVITY_TTL) {
        employeeActivity.delete(userId);
        removed++;
      }
    }
    if (removed > 0) console.log(`🧹 ${removed} entri aktivitas basi dibersihkan`);
  };
  const activityEvictTimer = setInterval(evictStaleActivity, 60 * 60 * 1000); // tiap jam
  activityEvictTimer.unref?.();

  // Tutup sesi monitor yang menggantung dari proses sebelumnya. Tanpa ini
  // screen_sessions terus menumpuk dan halaman sesi aktif menampilkan sesi mati.
  dbPool.query(
    `UPDATE screen_sessions SET status = 'ended', ended_at = NOW()
     WHERE status = 'active'`
  ).then((r) => {
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} sesi monitor menggantung ditutup saat startup`);
  }).catch((err) => console.error('[Monitor] Gagal menutup sesi menggantung:', err.message));

  // Sesi pemantauan lewat desktop agent: `${socketId}:${employeeId}` -> sessionId.
  // Jalur agent sebelumnya tidak pernah mencatat screen_sessions sama sekali.
  const agentWatchSessions = new Map();

  // Hitung berapa admin yang sedang memantau seorang karyawan, lalu beri tahu
  // karyawan tersebut supaya bisa menampilkan indikator "Aktif dan dipantau".
  const notifyWatchState = (employeeId) => {
    if (!employeeId) return;
    const agentRoom = io.sockets.adapter.rooms.get(`monitor:${employeeId}`);
    const agentWatchers = agentRoom ? agentRoom.size : 0;
    let webrtcWatchers = 0;
    for (const session of monitorSessions.values()) {
      if (session.employeeId === employeeId) webrtcWatchers++;
    }
    const total = agentWatchers + webrtcWatchers;
    io.to(`user:${employeeId}`).emit('monitor:watch-state', {
      watching: total > 0,
      watchers: total,
    });
  };

  // Tutup sesi monitor aktif milik satu admin (dipakai saat stop / disconnect)
  const endMonitorSessions = async (adminId, sessionId = null) => {
    try {
      const result = sessionId
        ? await dbPool.query(
            `UPDATE screen_sessions SET status = 'ended', ended_at = NOW()
             WHERE id = $1 AND admin_id = $2 AND status = 'active' RETURNING id`,
            [sessionId, adminId]
          )
        : await dbPool.query(
            `UPDATE screen_sessions SET status = 'ended', ended_at = NOW()
             WHERE admin_id = $1 AND status = 'active' RETURNING id`,
            [adminId]
          );
      for (const row of result.rows) monitorSessions.delete(row.id);
      return result.rowCount;
    } catch (err) {
      console.error('[Monitor] Gagal menutup sesi:', err.message);
      return 0;
    }
  };

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

      // Beri tahu status pemantauan saat ini — karyawan bisa saja reconnect
      // ketika admin sudah memantau, sehingga indikator harus langsung benar.
      notifyWatchState(socket.userId);
    }

    // Karyawan boleh menanyakan status pemantauan dirinya sendiri
    socket.on('monitor:watch-state?', () => notifyWatchState(socket.userId));

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

    // ===========================================
    // WebRTC Signaling for screen monitoring
    // Semua event divalidasi terhadap screen_sessions di DB — tanpa ini
    // user mana pun bisa memicu screen share ke dirinya sendiri.
    // ===========================================
    socket.on('monitor:offer', async (data) => {
      // Hanya admin yang boleh memulai pemantauan
      if (!isAdmin(socket.userRole)) {
        console.warn(`🚫 monitor:offer ditolak — ${socket.userEmail} bukan admin`);
        return;
      }
      if (!data?.sessionId || !data?.targetUserId) return;

      try {
        // Sesi harus benar-benar ada, aktif, dan milik admin ini untuk karyawan ini
        const check = await dbPool.query(
          `SELECT id FROM screen_sessions
           WHERE id = $1 AND admin_id = $2 AND employee_id = $3 AND status = 'active'`,
          [data.sessionId, socket.userId, data.targetUserId]
        );
        if (check.rows.length === 0) {
          console.warn(`🚫 monitor:offer ditolak — sesi ${data.sessionId} tidak valid untuk ${socket.userEmail}`);
          return;
        }

        monitorSessions.set(data.sessionId, {
          adminId: socket.userId,
          employeeId: data.targetUserId
        });

        io.to(`user:${data.targetUserId}`).emit('monitor:offer', {
          offer: data.offer,
          fromUserId: socket.userId,
          sessionId: data.sessionId
        });
        notifyWatchState(data.targetUserId);
      } catch (err) {
        console.error('[Monitor] Offer validation error:', err.message);
      }
    });

    socket.on('monitor:answer', (data) => {
      const session = monitorSessions.get(data?.sessionId);
      // Answer hanya sah dari karyawan target, dan hanya menuju admin pemilik sesi
      if (!session || session.employeeId !== socket.userId || session.adminId !== data.targetUserId) {
        console.warn(`🚫 monitor:answer ditolak dari ${socket.userEmail}`);
        return;
      }
      io.to(`user:${data.targetUserId}`).emit('monitor:answer', {
        answer: data.answer,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    socket.on('monitor:ice-candidate', (data) => {
      const session = monitorSessions.get(data?.sessionId);
      if (!session) return;
      // ICE mengalir dua arah, tapi hanya antara dua peserta sesi ini
      const isAdminSide    = session.adminId === socket.userId && session.employeeId === data.targetUserId;
      const isEmployeeSide = session.employeeId === socket.userId && session.adminId === data.targetUserId;
      if (!isAdminSide && !isEmployeeSide) {
        console.warn(`🚫 monitor:ice-candidate ditolak dari ${socket.userEmail}`);
        return;
      }
      io.to(`user:${data.targetUserId}`).emit('monitor:ice-candidate', {
        candidate: data.candidate,
        fromUserId: socket.userId,
        sessionId: data.sessionId
      });
    });

    // Admin menghentikan pemantauan — tutup sesi di DB & beri tahu karyawan
    socket.on('monitor:stop', async (data) => {
      if (!isAdmin(socket.userRole)) return;
      const session = monitorSessions.get(data?.sessionId);
      const closed = await endMonitorSessions(socket.userId, data?.sessionId || null);
      if (session) {
        io.to(`user:${session.employeeId}`).emit('monitor:stopped', { sessionId: data.sessionId });
        notifyWatchState(session.employeeId);
      }
      if (closed > 0) console.log(`🛑 ${socket.userEmail} menghentikan ${closed} sesi monitor`);
    });

    // Start working (from WelcomeWorkModal)
    socket.on('activity:start-working', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        mood: data?.mood || null,
        workStartedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      io.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId)
      });
      console.log(`🏢 ${socket.userEmail} started working`);
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
    socket.on('agent:watch', async (data) => {
      if (!isAdmin(socket.userRole)) return;
      if (!data?.targetUserId) return;

      socket.join(`monitor:${data.targetUserId}`);

      // Catat sesi supaya pemantauan lewat desktop agent ikut terekam
      const key = `${socket.id}:${data.targetUserId}`;
      if (!agentWatchSessions.has(key)) {
        try {
          const res = await dbPool.query(
            `INSERT INTO screen_sessions (employee_id, admin_id, status)
             VALUES ($1, $2, 'active') RETURNING id`,
            [data.targetUserId, socket.userId]
          );
          agentWatchSessions.set(key, res.rows[0].id);
        } catch (err) {
          console.error('[Monitor] Gagal mencatat sesi agent:', err.message);
        }
      }

      // Tell agent to start capturing
      io.to(`user:${data.targetUserId}`).emit('agent:config', {
        fps: data.fps || 1,
        quality: data.quality || 60
      });
      notifyWatchState(data.targetUserId);
      console.log(`👁️ ${socket.userEmail} started watching ${data.targetUserId}`);
    });

    // Admin stops watching
    socket.on('agent:unwatch', async (data) => {
      if (!data?.targetUserId) return;
      socket.leave(`monitor:${data.targetUserId}`);

      const key = `${socket.id}:${data.targetUserId}`;
      const sessionId = agentWatchSessions.get(key);
      if (sessionId) {
        agentWatchSessions.delete(key);
        await endMonitorSessions(socket.userId, sessionId);
      }

      // If no more watchers, tell agent to stop capturing
      const room = io.sockets.adapter.rooms.get(`monitor:${data.targetUserId}`);
      if (!room || room.size === 0) {
        io.to(`user:${data.targetUserId}`).emit('agent:config', { fps: 0 });
      }
      notifyWatchState(data.targetUserId);
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

    // Data aktivitas seluruh karyawan — admin only
    socket.on('activity:request-all', () => {
      if (!isAdmin(socket.userRole)) {
        console.warn(`🚫 activity:request-all ditolak — ${socket.userEmail} bukan admin`);
        return;
      }
      const allActivity = {};
      employeeActivity.forEach((value, key) => { allActivity[key] = value; });
      socket.emit('activity:all-data', allActivity);
    });

    socket.on('activity:join-monitor', () => {
      if (!isAdmin(socket.userRole)) {
        console.warn(`🚫 activity:join-monitor ditolak — ${socket.userEmail} bukan admin`);
        return;
      }
      socket.join('room:admin-monitor');
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userEmail} (source: ${socket.source})`);

      // Bersihkan sesi monitor yang melibatkan socket ini
      const affectedEmployees = new Set();
      for (const [sessionId, session] of monitorSessions.entries()) {
        if (session.adminId === socket.userId || session.employeeId === socket.userId) {
          if (session.adminId === socket.userId) affectedEmployees.add(session.employeeId);
          monitorSessions.delete(sessionId);
        }
      }

      // Admin terputus → tutup sesi di DB dan hentikan indikator di sisi karyawan
      if (isAdmin(socket.userRole)) {
        // Sesi lewat desktop agent milik socket ini
        for (const [key, sessionId] of agentWatchSessions.entries()) {
          if (!key.startsWith(`${socket.id}:`)) continue;
          affectedEmployees.add(key.slice(socket.id.length + 1));
          agentWatchSessions.delete(key);
        }

        const closed = await endMonitorSessions(socket.userId);
        if (closed > 0) console.log(`🛑 ${closed} sesi monitor ditutup (admin disconnect)`);

        for (const employeeId of affectedEmployees) {
          io.to(`user:${employeeId}`).emit('monitor:stopped', {});
          // Hentikan capture desktop agent bila tidak ada lagi yang menonton
          const room = io.sockets.adapter.rooms.get(`monitor:${employeeId}`);
          if (!room || room.size === 0) {
            io.to(`user:${employeeId}`).emit('agent:config', { fps: 0 });
          }
          notifyWatchState(employeeId);
        }
      }

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

  // Start cron scheduler (deadline reminders)
  try {
    const { startScheduler } = require('./lib/scheduler');
    startScheduler();
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err);
  }

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

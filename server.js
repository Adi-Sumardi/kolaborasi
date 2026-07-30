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

// Diisi setelah server dibuat. Sebelumnya gracefulShutdown mengacu langsung ke
// `server` yang dideklarasikan di scope lain (dalam app.prepare().then()),
// sehingga SIGTERM/SIGINT selalu melempar ReferenceError dan shutdown gagal.
let serverRef = null;
let onShutdown = null;

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} signal received: closing HTTP server`);

  // Force close after 10 seconds
  const forceTimer = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);

  try {
    if (onShutdown) await onShutdown();
  } catch (err) {
    console.error('Shutdown hook error:', err.message);
  }

  if (!serverRef) {
    clearTimeout(forceTimer);
    process.exit(0);
  }

  serverRef.close(() => {
    console.log('HTTP server closed');
    clearTimeout(forceTimer);
    process.exit(0);
  });
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
  serverRef = server;
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
    // Frame agent:screenshot bisa lebih besar saat mode "Lihat Layar" penuh
    // minta resolusi/kualitas tinggi (lihat applyAgentSettings) — beri ruang.
    maxHttpBufferSize: 3 * 1024 * 1024 // 3MB
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

  // ===========================================
  // Persistensi aktivitas karyawan
  // Map di memori adalah sumber kebenaran saat berjalan; DB dipakai agar
  // state tidak hilang total saat server restart.
  // ===========================================
  const dirtyActivity = new Set();

  // Satu pintu untuk semua perubahan aktivitas: merge -> tandai perlu disimpan
  // -> siarkan ke admin. Sebelumnya pola ini disalin di 8 tempat berbeda.
  const updateActivity = (userId, patch, { broadcast = true } = {}) => {
    const existing = employeeActivity.get(userId) || {};
    const next = { ...existing, ...patch, lastActivity: new Date().toISOString() };
    employeeActivity.set(userId, next);
    dirtyActivity.add(userId);
    if (broadcast) {
      io.to('room:admin-monitor').emit('activity:update', { userId, ...next });
    }
    return next;
  };

  const flushActivity = async () => {
    if (dirtyActivity.size === 0) return;
    const ids = [...dirtyActivity];
    dirtyActivity.clear();
    for (const userId of ids) {
      const a = employeeActivity.get(userId);
      if (!a) continue;
      try {
        await dbPool.query(
          `INSERT INTO employee_activity
             (user_id, status, page, page_label, online_since, last_activity,
              screen_ready, agent_connected, work_session_active, work_started_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             status = EXCLUDED.status, page = EXCLUDED.page, page_label = EXCLUDED.page_label,
             online_since = EXCLUDED.online_since, last_activity = EXCLUDED.last_activity,
             screen_ready = EXCLUDED.screen_ready, agent_connected = EXCLUDED.agent_connected,
             work_session_active = EXCLUDED.work_session_active,
             work_started_at = EXCLUDED.work_started_at, updated_at = NOW()`,
          [userId, a.status || 'offline', a.page || null, a.pageLabel || null,
           a.onlineSince || null, a.lastActivity || null,
           !!a.screenReady, !!a.agentConnected, !!a.workSessionActive, a.workStartedAt || null]
        );
      } catch (err) {
        console.error('[Activity] Gagal menyimpan:', err.message);
      }
    }
  };
  const activityFlushTimer = setInterval(flushActivity, 15 * 1000);
  activityFlushTimer.unref?.();

  // Simpan sisa perubahan & tutup sesi monitor sebelum proses berakhir
  onShutdown = async () => {
    await flushActivity();
    try {
      const r = await dbPool.query(
        `UPDATE screen_sessions SET status = 'ended', ended_at = NOW() WHERE status = 'active'`
      );
      if (r.rowCount > 0) console.log(`🛑 ${r.rowCount} sesi monitor ditutup saat shutdown`);
    } catch (err) {
      console.error('[Shutdown] Gagal menutup sesi:', err.message);
    }
  };

  // Pulihkan state terakhir saat startup. Status dipaksa offline karena semua
  // socket sudah putus — klien akan otomatis reconnect dan menyalakannya lagi.
  // Yang berharga di sini: halaman terakhir & kapan terakhir aktif tidak hilang.
  dbPool.query(
    `SELECT user_id, page, page_label, online_since, last_activity, work_started_at
     FROM employee_activity
     WHERE last_activity > NOW() - INTERVAL '24 hours'`
  ).then((res) => {
    for (const r of res.rows) {
      employeeActivity.set(r.user_id, {
        status: 'offline',
        page: r.page,
        pageLabel: r.page_label,
        onlineSince: r.online_since ? new Date(r.online_since).toISOString() : null,
        lastActivity: r.last_activity ? new Date(r.last_activity).toISOString() : null,
        screenReady: false,
        agentConnected: false,
        workSessionActive: false,
        workStartedAt: r.work_started_at ? new Date(r.work_started_at).toISOString() : null,
      });
    }
    if (res.rows.length > 0) console.log(`♻️  ${res.rows.length} state aktivitas dipulihkan dari DB`);
  }).catch((err) => console.error('[Activity] Gagal memulihkan state:', err.message));

  // Buang entri aktivitas karyawan yang sudah lama offline supaya Map tidak
  // tumbuh selamanya (user nonaktif/terhapus tidak pernah connect lagi).
  const ACTIVITY_TTL = 24 * 60 * 60 * 1000; // 24 jam
  const evictStaleActivity = async () => {
    const now = Date.now();
    let removed = 0;
    for (const [userId, activity] of employeeActivity.entries()) {
      if (activity.status !== 'offline') continue;
      const last = new Date(activity.lastActivity || 0).getTime();
      if (now - last > ACTIVITY_TTL) {
        employeeActivity.delete(userId);
        dirtyActivity.delete(userId);
        removed++;
      }
    }
    if (removed > 0) console.log(`🧹 ${removed} entri aktivitas basi dibersihkan`);
    try {
      await dbPool.query(`DELETE FROM employee_activity WHERE last_activity < NOW() - INTERVAL '30 days'`);
    } catch (err) {
      console.error('[Activity] Gagal membersihkan DB:', err.message);
    }
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

  // Siapa menonton siapa dan pada fps berapa: employeeId -> Map<socketId, fps>.
  // Perlu per-penonton karena thumbnail grid menonton banyak orang di 0.2 fps
  // sementara tampilan penuh minta 1 fps — tanpa ini yang terakhir menimpa.
  // employeeId -> Map<socketId, {fps, quality, width}>
  const agentWatchers = new Map();
  const IDLE_FPS = 0.2;
  const DEFAULT_QUALITY = 60;
  const DEFAULT_WIDTH = 1280;

  // Hitung frame per socket agent — untuk log diagnostik (frame pertama + tiap 20)
  const agentFrameCounts = new Map();

  // Gabungkan permintaan semua penonton (grid @fps rendah + "Lihat Layar" @fps
  // tinggi bisa nonton bareng): ambil fps/quality/width TERTINGGI yang diminta,
  // supaya penonton yang minta paling detail tetap terlayani. Lalu turunkan ke
  // IDLE_FPS bila karyawannya sedang idle (hemat bandwidth saat tak ada aktivitas).
  const applyAgentSettings = (employeeId) => {
    const watchers = agentWatchers.get(employeeId);
    if (!watchers || watchers.size === 0) {
      io.to(`user:${employeeId}`).emit('agent:config', { fps: 0 });
      return 0;
    }
    const settings = [...watchers.values()];
    const requestedFps = Math.max(...settings.map(s => s.fps));
    const quality = Math.max(...settings.map(s => s.quality || DEFAULT_QUALITY));
    const width = Math.max(...settings.map(s => s.width || DEFAULT_WIDTH));
    const idle = employeeActivity.get(employeeId)?.status === 'idle';
    const fps = idle ? Math.min(requestedFps, IDLE_FPS) : requestedFps;
    io.to(`user:${employeeId}`).emit('agent:config', {
      fps,
      quality: idle ? Math.min(quality, 40) : quality,
      width: idle ? Math.min(width, DEFAULT_WIDTH) : width,
    });
    return fps;
  };

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
      // Jangan reset "online sejak" kalau ini cuma reconnect singkat
      // (blip jaringan / refresh halaman) — durasi kerja jadi salah kalau direset.
      const lastSeen = new Date(existing.lastActivity || 0).getTime();
      const reconnectSingkat = existing.onlineSince && (Date.now() - lastSeen) < 5 * 60 * 1000;

      updateActivity(socket.userId, {
        status: 'online',
        page: existing.page || 'home',
        pageLabel: existing.pageLabel || 'Dashboard',
        agentConnected: socket.source === 'desktop-agent' ? true : (existing.agentConnected || false),
        onlineSince: reconnectSingkat ? existing.onlineSince : new Date().toISOString(),
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
    socket.on('activity:start-working', () => {
      updateActivity(socket.userId, {
        status: 'online',
        workStartedAt: new Date().toISOString(),
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

        updateActivity(socket.userId, {
          workSessionActive: true,
          workClockIn: new Date().toISOString(),
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

        updateActivity(socket.userId, { workSessionActive: false });
      } catch (err) {
        console.error('[WorkSession] Clock-out error:', err.message);
      }
    });

    // Screen share ready/stopped (from "Mulai Bekerja" / "Selesai Bekerja")
    socket.on('monitor:screen-ready', () => {
      updateActivity(socket.userId, { screenReady: true });
      console.log(`🖥️ ${socket.userEmail} screen share ready`);
    });

    socket.on('monitor:screen-stopped', () => {
      updateActivity(socket.userId, { screenReady: false });
      console.log(`🖥️ ${socket.userEmail} screen share stopped`);
    });

    // --- Desktop Agent Events ---

    // Agent sends screenshot frame (binary buffer)
    socket.on('agent:screenshot', (frameBuffer) => {
      if (socket.source !== 'desktop-agent') return;

      // Log jarang (frame pertama + tiap 20) — supaya masalah "layar tidak
      // muncul" bisa dibedakan: agent tidak pernah kirim frame, vs frame
      // terkirim tapi tidak ada penonton, vs masalah di sisi browser admin.
      const n = (agentFrameCounts.get(socket.id) || 0) + 1;
      agentFrameCounts.set(socket.id, n);
      if (n === 1 || n % 20 === 0) {
        const room = io.sockets.adapter.rooms.get(`monitor:${socket.userId}`);
        const watchers = room ? room.size : 0;
        const size = frameBuffer?.length || frameBuffer?.byteLength || 0;
        console.log(`📸 ${socket.userEmail} frame #${n}, ${size} bytes, ${watchers} penonton`);
      }

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

      // Catat settingan yang diminta penonton ini, lalu terapkan yang efektif
      // (gabungan tertinggi dari semua penonton — lihat applyAgentSettings)
      if (!agentWatchers.has(data.targetUserId)) agentWatchers.set(data.targetUserId, new Map());
      agentWatchers.get(data.targetUserId).set(socket.id, {
        fps: Number(data.fps) || 1,
        quality: Number(data.quality) || DEFAULT_QUALITY,
        width: Number(data.width) || DEFAULT_WIDTH,
      });
      const fps = applyAgentSettings(data.targetUserId);

      notifyWatchState(data.targetUserId);
      console.log(`👁️ ${socket.userEmail} started watching ${data.targetUserId} (fps efektif: ${fps})`);
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

      // Lepas fps penonton ini; applyAgentSettings otomatis mengirim fps 0
      // kalau sudah tidak ada penonton tersisa.
      const watchers = agentWatchers.get(data.targetUserId);
      if (watchers) {
        watchers.delete(socket.id);
        if (watchers.size === 0) agentWatchers.delete(data.targetUserId);
      }
      applyAgentSettings(data.targetUserId);
      notifyWatchState(data.targetUserId);
      console.log(`👁️ ${socket.userEmail} stopped watching ${data.targetUserId}`);
    });

    // Activity Tracking Events (from client ActivityTracker)
    socket.on('activity:online', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      updateActivity(socket.userId, {
        status: 'online',
        page: data.page || existing.page || 'home',
        pageLabel: data.pageLabel || existing.pageLabel || 'Dashboard',
        onlineSince: existing.onlineSince || new Date().toISOString(),
      });
    });

    socket.on('activity:page-change', (data) => {
      updateActivity(socket.userId, { page: data.page, pageLabel: data.pageLabel });
    });

    socket.on('activity:idle', () => {
      updateActivity(socket.userId, { status: 'idle' });
      // Adaptive fps: karyawan idle -> turunkan laju capture, hemat bandwidth
      applyAgentSettings(socket.userId);
    });

    socket.on('activity:active', () => {
      updateActivity(socket.userId, { status: 'online' });
      applyAgentSettings(socket.userId);
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

      agentFrameCounts.delete(socket.id);

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

        // Lepas semua langganan fps milik socket ini
        for (const [employeeId, watchers] of agentWatchers.entries()) {
          if (!watchers.has(socket.id)) continue;
          affectedEmployees.add(employeeId);
          watchers.delete(socket.id);
          if (watchers.size === 0) agentWatchers.delete(employeeId);
        }

        for (const employeeId of affectedEmployees) {
          io.to(`user:${employeeId}`).emit('monitor:stopped', {});
          applyAgentSettings(employeeId); // kirim fps 0 bila tak ada penonton tersisa
          notifyWatchState(employeeId);
        }
      }

      // Mark as offline in activity store
      if (employeeActivity.has(socket.userId)) {
        const updates = socket.source === 'desktop-agent'
          // Desktop agent putus — tandai agent offline, status browser tetap
          ? { agentConnected: false }
          // Browser putus — tandai offline
          : { status: 'offline', screenReady: false };

        updateActivity(socket.userId, updates);
        // Simpan segera — kalau server mati sesudah ini, status offline
        // terakhir tetap terekam dan tidak menunggu flush berkala.
        flushActivity().catch(() => {});
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

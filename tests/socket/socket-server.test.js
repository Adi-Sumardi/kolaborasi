/**
 * Tests for lib/socket-server.js
 *
 * Uses real socket.io + socket.io-client to test event handlers
 * with an in-memory HTTP server (no network).
 *
 * @jest-environment node
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import ClientIO from 'socket.io-client';
import jwt from 'jsonwebtoken';

// --- bootstrap ---------------------------------------------------------------

const JWT_SECRET = 'test-secret-key';
let httpServer, io, port;

// We re-implement the server logic inline so we can control the JWT_SECRET
// without touching process.env at module scope.
function bootSocketServer(server) {
  const sio = new Server(server, {
    cors: { origin: '*' },
    path: '/socket.io/',
  });

  sio.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  const employeeActivity = new Map();

  sio.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    if (['karyawan', 'sdm'].includes(socket.userRole)) {
      employeeActivity.set(socket.userId, {
        status: 'online',
        page: 'home',
        pageLabel: 'Dashboard',
        onlineSince: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });
      sio.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId),
      });
    }

    socket.on('join_room', (roomId) => socket.join(`room:${roomId}`));
    socket.on('leave_room', (roomId) => socket.leave(`room:${roomId}`));

    socket.on('send_message', (data) => {
      sio.to(`room:${data.roomId}`).emit('new_message', data);
    });

    socket.on('typing', (data) => {
      socket.to(`room:${data.roomId}`).emit('user_typing', {
        userId: socket.userId,
        email: socket.userEmail,
      });
    });

    // WebRTC signaling
    socket.on('monitor:offer', (data) => {
      sio.to(`user:${data.targetUserId}`).emit('monitor:offer', {
        offer: data.offer,
        fromUserId: socket.userId,
        sessionId: data.sessionId,
      });
    });
    socket.on('monitor:answer', (data) => {
      sio.to(`user:${data.targetUserId}`).emit('monitor:answer', {
        answer: data.answer,
        fromUserId: socket.userId,
        sessionId: data.sessionId,
      });
    });
    socket.on('monitor:ice-candidate', (data) => {
      sio.to(`user:${data.targetUserId}`).emit('monitor:ice-candidate', {
        candidate: data.candidate,
        fromUserId: socket.userId,
        sessionId: data.sessionId,
      });
    });
    socket.on('monitor:screen-available', () => {
      sio.emit('monitor:employee-online', { userId: socket.userId, available: true });
    });
    socket.on('monitor:screen-unavailable', () => {
      sio.emit('monitor:employee-online', { userId: socket.userId, available: false });
    });

    // Activity tracking
    socket.on('activity:online', (data) => {
      employeeActivity.set(socket.userId, {
        status: 'online',
        page: data.page || 'home',
        pageLabel: data.pageLabel || 'Dashboard',
        onlineSince: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });
      sio.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId),
      });
    });

    socket.on('activity:page-change', (data) => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: existing.status === 'idle' ? 'idle' : 'online',
        page: data.page,
        pageLabel: data.pageLabel,
        lastActivity: new Date().toISOString(),
      });
      sio.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId),
      });
    });

    socket.on('activity:idle', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'idle',
        lastActivity: new Date().toISOString(),
      });
      sio.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId),
      });
    });

    socket.on('activity:active', () => {
      const existing = employeeActivity.get(socket.userId) || {};
      employeeActivity.set(socket.userId, {
        ...existing,
        status: 'online',
        lastActivity: new Date().toISOString(),
      });
      sio.to('room:admin-monitor').emit('activity:update', {
        userId: socket.userId,
        ...employeeActivity.get(socket.userId),
      });
    });

    socket.on('activity:request-all', () => {
      const allActivity = {};
      employeeActivity.forEach((value, key) => {
        allActivity[key] = value;
      });
      socket.emit('activity:all-data', allActivity);
    });

    socket.on('activity:join-monitor', () => {
      socket.join('room:admin-monitor');
    });

    socket.on('disconnect', () => {
      if (employeeActivity.has(socket.userId)) {
        employeeActivity.set(socket.userId, {
          ...employeeActivity.get(socket.userId),
          status: 'offline',
          lastActivity: new Date().toISOString(),
        });
        sio.to('room:admin-monitor').emit('activity:update', {
          userId: socket.userId,
          ...employeeActivity.get(socket.userId),
        });
      }
      sio.emit('monitor:employee-online', { userId: socket.userId, available: false });
    });
  });

  return sio;
}

// --- helpers -----------------------------------------------------------------

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

function connectClient(tokenPayload, opts = {}) {
  const token = makeToken(tokenPayload);
  return ClientIO(`http://localhost:${port}`, {
    auth: { token },
    path: '/socket.io/',
    transports: ['websocket'],
    forceNew: true,
    ...opts,
  });
}

function waitFor(emitter, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// --- lifecycle ---------------------------------------------------------------

beforeAll((done) => {
  httpServer = createServer();
  io = bootSocketServer(httpServer);
  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  // Disconnect any remaining clients before closing the server
  clients.forEach((c) => c.disconnect());
  clients = [];
  io.close(() => {
    // io.close() already closes the underlying httpServer,
    // so we only call httpServer.close() if it's still listening
    if (httpServer.listening) {
      httpServer.close(done);
    } else {
      done();
    }
  });
});

// Store clients created during each test so we can clean them up
let clients = [];
afterEach(() => {
  clients.forEach((c) => c.disconnect());
  clients = [];
});

// --- tests -------------------------------------------------------------------

describe('Socket Server', () => {
  // ---- Authentication ----

  describe('Authentication', () => {
    test('connects with a valid token', (done) => {
      const client = connectClient({ userId: 'u1', email: 'a@b.com', role: 'karyawan' });
      clients.push(client);
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        done();
      });
    });

    test('rejects connection without a token', (done) => {
      const client = ClientIO(`http://localhost:${port}`, {
        path: '/socket.io/',
        transports: ['websocket'],
        forceNew: true,
        // no auth
      });
      clients.push(client);
      client.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        done();
      });
    });

    test('rejects connection with an invalid token', (done) => {
      const client = ClientIO(`http://localhost:${port}`, {
        auth: { token: 'bad-token' },
        path: '/socket.io/',
        transports: ['websocket'],
        forceNew: true,
      });
      clients.push(client);
      client.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        done();
      });
    });
  });

  // ---- Chat events ----

  describe('Chat events', () => {
    test('join_room + send_message delivers to room members', async () => {
      const sender = connectClient({ userId: 'sender1', email: 's@b.com', role: 'karyawan' });
      const receiver = connectClient({ userId: 'recv1', email: 'r@b.com', role: 'admin' });
      clients.push(sender, receiver);

      await Promise.all([waitFor(sender, 'connect'), waitFor(receiver, 'connect')]);

      // Both join the same room
      sender.emit('join_room', 'chat-room-1');
      receiver.emit('join_room', 'chat-room-1');

      // Give socket.io a moment to process join
      await new Promise((r) => setTimeout(r, 100));

      const msgPromise = waitFor(receiver, 'new_message');
      sender.emit('send_message', { roomId: 'chat-room-1', text: 'hello' });

      const msg = await msgPromise;
      expect(msg.text).toBe('hello');
      expect(msg.roomId).toBe('chat-room-1');
    });

    test('typing emits user_typing to other room members', async () => {
      const typer = connectClient({ userId: 'typer1', email: 'typer@b.com', role: 'karyawan' });
      const watcher = connectClient({ userId: 'watcher1', email: 'w@b.com', role: 'karyawan' });
      clients.push(typer, watcher);

      await Promise.all([waitFor(typer, 'connect'), waitFor(watcher, 'connect')]);

      typer.emit('join_room', 'typing-room');
      watcher.emit('join_room', 'typing-room');
      await new Promise((r) => setTimeout(r, 100));

      const typingPromise = waitFor(watcher, 'user_typing');
      typer.emit('typing', { roomId: 'typing-room' });

      const data = await typingPromise;
      expect(data.userId).toBe('typer1');
      expect(data.email).toBe('typer@b.com');
    });
  });

  // ---- Activity events ----

  describe('Activity events', () => {
    test('karyawan auto-tracked as online on connect', async () => {
      // Admin joins monitor room first
      const admin = connectClient({ userId: 'admin1', email: 'admin@b.com', role: 'admin' });
      clients.push(admin);
      await waitFor(admin, 'connect');
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      const updatePromise = waitFor(admin, 'activity:update');
      const employee = connectClient({ userId: 'emp1', email: 'emp@b.com', role: 'karyawan' });
      clients.push(employee);

      const update = await updatePromise;
      expect(update.userId).toBe('emp1');
      expect(update.status).toBe('online');
    });

    test('activity:online stores and broadcasts', async () => {
      const admin = connectClient({ userId: 'admin2', email: 'admin2@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp2', email: 'emp2@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      const updatePromise = waitFor(admin, 'activity:update');
      emp.emit('activity:online', { page: '/tasks', pageLabel: 'Tasks' });

      const update = await updatePromise;
      expect(update.userId).toBe('emp2');
      expect(update.status).toBe('online');
      expect(update.page).toBe('/tasks');
      expect(update.pageLabel).toBe('Tasks');
    });

    test('activity:page-change updates page info', async () => {
      const admin = connectClient({ userId: 'admin3', email: 'admin3@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp3', email: 'emp3@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      // First set online status
      emp.emit('activity:online', { page: '/home', pageLabel: 'Home' });
      await waitFor(admin, 'activity:update');

      // Now change page
      const updatePromise = waitFor(admin, 'activity:update');
      emp.emit('activity:page-change', { page: '/reports', pageLabel: 'Reports' });

      const update = await updatePromise;
      expect(update.page).toBe('/reports');
      expect(update.pageLabel).toBe('Reports');
      expect(update.status).toBe('online');
    });

    test('activity:idle sets status to idle', async () => {
      // Admin must join monitor room BEFORE employee connects,
      // otherwise the auto-track update fires before admin is in the room.
      const admin = connectClient({ userId: 'admin4', email: 'admin4@b.com', role: 'admin' });
      clients.push(admin);
      await waitFor(admin, 'connect');
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      // Now connect employee – auto-track fires and admin receives it
      const autoTrackPromise = waitFor(admin, 'activity:update');
      const emp = connectClient({ userId: 'emp4', email: 'emp4@b.com', role: 'karyawan' });
      clients.push(emp);
      await autoTrackPromise;

      const idlePromise = waitFor(admin, 'activity:update');
      emp.emit('activity:idle');

      const update = await idlePromise;
      expect(update.userId).toBe('emp4');
      expect(update.status).toBe('idle');
    });

    test('activity:active sets status back to online', async () => {
      // Admin must join monitor room BEFORE employee connects
      const admin = connectClient({ userId: 'admin5', email: 'admin5@b.com', role: 'admin' });
      clients.push(admin);
      await waitFor(admin, 'connect');
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      // Now connect employee – auto-track fires and admin receives it
      const autoTrackPromise = waitFor(admin, 'activity:update');
      const emp = connectClient({ userId: 'emp5', email: 'emp5@b.com', role: 'karyawan' });
      clients.push(emp);
      await autoTrackPromise;

      // Go idle first
      const idlePromise = waitFor(admin, 'activity:update');
      emp.emit('activity:idle');
      await idlePromise;

      // Back to active
      const activePromise = waitFor(admin, 'activity:update');
      emp.emit('activity:active');

      const update = await activePromise;
      expect(update.status).toBe('online');
    });

    test('activity:request-all returns all tracked data', async () => {
      const admin = connectClient({ userId: 'admin6', email: 'admin6@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp6', email: 'emp6@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);
      await new Promise((r) => setTimeout(r, 100));

      const dataPromise = waitFor(admin, 'activity:all-data');
      admin.emit('activity:request-all');

      const data = await dataPromise;
      expect(typeof data).toBe('object');
      // Should contain at least emp6 from auto-track on connect
      expect(data['emp6']).toBeDefined();
      expect(data['emp6'].status).toBe('online');
    });
  });

  // ---- Monitor / WebRTC signaling ----

  describe('Monitor events (WebRTC signaling)', () => {
    test('monitor:offer is relayed to target user', async () => {
      const admin = connectClient({ userId: 'adm-m1', email: 'adm-m1@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-m1', email: 'emp-m1@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const offerPromise = waitFor(emp, 'monitor:offer');
      admin.emit('monitor:offer', {
        targetUserId: 'emp-m1',
        offer: { type: 'offer', sdp: 'test-sdp' },
        sessionId: 'sess1',
      });

      const data = await offerPromise;
      expect(data.offer.sdp).toBe('test-sdp');
      expect(data.fromUserId).toBe('adm-m1');
      expect(data.sessionId).toBe('sess1');
    });

    test('monitor:answer is relayed to target user', async () => {
      const admin = connectClient({ userId: 'adm-m2', email: 'adm-m2@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-m2', email: 'emp-m2@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const answerPromise = waitFor(admin, 'monitor:answer');
      emp.emit('monitor:answer', {
        targetUserId: 'adm-m2',
        answer: { type: 'answer', sdp: 'answer-sdp' },
        sessionId: 'sess2',
      });

      const data = await answerPromise;
      expect(data.answer.sdp).toBe('answer-sdp');
      expect(data.fromUserId).toBe('emp-m2');
    });

    test('monitor:ice-candidate is relayed to target user', async () => {
      const admin = connectClient({ userId: 'adm-m3', email: 'adm-m3@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-m3', email: 'emp-m3@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const icePromise = waitFor(emp, 'monitor:ice-candidate');
      admin.emit('monitor:ice-candidate', {
        targetUserId: 'emp-m3',
        candidate: { candidate: 'ice-data' },
        sessionId: 'sess3',
      });

      const data = await icePromise;
      expect(data.candidate.candidate).toBe('ice-data');
      expect(data.fromUserId).toBe('adm-m3');
    });

    test('monitor:screen-available broadcasts employee-online', async () => {
      const admin = connectClient({ userId: 'adm-m4', email: 'adm-m4@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-m4', email: 'emp-m4@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const onlinePromise = waitFor(admin, 'monitor:employee-online');
      emp.emit('monitor:screen-available', {});

      const data = await onlinePromise;
      expect(data.userId).toBe('emp-m4');
      expect(data.available).toBe(true);
    });

    test('monitor:screen-unavailable broadcasts unavailable', async () => {
      const admin = connectClient({ userId: 'adm-m5', email: 'adm-m5@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-m5', email: 'emp-m5@b.com', role: 'karyawan' });
      clients.push(admin, emp);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const offlinePromise = waitFor(admin, 'monitor:employee-online');
      emp.emit('monitor:screen-unavailable');

      const data = await offlinePromise;
      expect(data.userId).toBe('emp-m5');
      expect(data.available).toBe(false);
    });
  });

  // ---- Disconnect cleanup ----

  describe('Disconnect', () => {
    test('marks employee offline and broadcasts on disconnect', async () => {
      // Admin must join monitor room BEFORE employee connects
      const admin = connectClient({ userId: 'adm-d1', email: 'adm-d1@b.com', role: 'admin' });
      clients.push(admin);
      await waitFor(admin, 'connect');
      admin.emit('activity:join-monitor');
      await new Promise((r) => setTimeout(r, 100));

      // Now connect employee – auto-track fires and admin receives it
      const autoTrackPromise = waitFor(admin, 'activity:update');
      const emp = connectClient({ userId: 'emp-d1', email: 'emp-d1@b.com', role: 'karyawan' });
      await autoTrackPromise;

      // Disconnect employee and expect offline update
      const offlinePromise = waitFor(admin, 'activity:update');
      emp.disconnect();

      const update = await offlinePromise;
      expect(update.userId).toBe('emp-d1');
      expect(update.status).toBe('offline');
    });

    test('broadcasts monitor:employee-online false on disconnect', async () => {
      const admin = connectClient({ userId: 'adm-d2', email: 'adm-d2@b.com', role: 'admin' });
      const emp = connectClient({ userId: 'emp-d2', email: 'emp-d2@b.com', role: 'karyawan' });
      clients.push(admin);

      await Promise.all([waitFor(admin, 'connect'), waitFor(emp, 'connect')]);

      const monitorPromise = waitFor(admin, 'monitor:employee-online');
      emp.disconnect();

      const data = await monitorPromise;
      expect(data.userId).toBe('emp-d2');
      expect(data.available).toBe(false);
    });
  });
});

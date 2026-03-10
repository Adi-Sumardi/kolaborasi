/**
 * @jest-environment node
 */

/**
 * Chat API Tests
 *
 * Tests for GET /api/chat/rooms, POST /api/chat/rooms,
 * GET /api/chat/rooms/:id/messages, POST /api/chat/messages
 */

import { GET, POST } from '@/app/api/[[...path]]/route';

jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('$2b$10$hashed')),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-token'),
  verify: jest.fn(),
}));

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({ base32: 'SECRET' })),
  totp: { verify: jest.fn() },
  otpauthURL: jest.fn(),
}));

jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('@/lib/socket-server', () => ({ sendNotification: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({
  sanitizeUserInput: jest.fn((d) => d),
  sanitizeEmail: jest.fn((e) => e),
  sanitizeString: jest.fn((s) => s),
  validators: { email: jest.fn(() => true) },
  validatePasswordStrength: jest.fn(() => ({ isValid: true, errors: [] })),
}));
jest.mock('@/lib/rateLimit', () => ({
  rateLimitMiddleware: jest.fn(() => ({ allowed: true })),
  getClientIP: jest.fn(() => '127.0.0.1'),
}));
jest.mock('@/lib/emailService', () => ({ sendSubmissionNotificationEmail: jest.fn() }));
jest.mock('@/lib/push-notifications', () => ({
  getVapidPublicKey: jest.fn(),
  sendPushNotification: jest.fn(),
  sendBulkPushNotifications: jest.fn(),
}));

const { query, transaction } = require('@/lib/db');
const jwt = require('jsonwebtoken');

function createRequest(method, path, body = null, headers = {}) {
  const url = `http://localhost:3000/api/${path}`;
  const opts = {
    method,
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
  };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function pathParams(p) {
  return { params: { path: p.split('/') } };
}

function mockUser(userId = 1, role = 'super_admin') {
  jwt.verify.mockReturnValueOnce({ userId, email: `user${userId}@test.com`, role });
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('API: Chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/chat/rooms
  // ==========================================
  describe('GET /api/chat/rooms', () => {
    it('should list chat rooms for authenticated user', async () => {
      mockUser(1);

      const mockRooms = [
        {
          id: 1, name: 'General', type: 'group', members: [1, 2, 3],
          created_by: 1, created_at: '2025-01-01', updated_at: '2025-03-01',
        },
        {
          id: 2, name: 'Project Alpha', type: 'group', members: [1, 4],
          created_by: 1, created_at: '2025-02-01', updated_at: '2025-02-15',
        },
      ];

      query.mockResolvedValueOnce({ rows: mockRooms });

      const req = createRequest('GET', 'chat/rooms', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.rooms).toHaveLength(2);
      expect(data.rooms[0].name).toBe('General');
      expect(data.rooms[1].members).toEqual([1, 4]);
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'chat/rooms', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });

    it('should return empty array when user has no rooms', async () => {
      mockUser(99);
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('GET', 'chat/rooms', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.rooms).toEqual([]);
    });
  });

  // ==========================================
  // POST /api/chat/rooms
  // ==========================================
  describe('POST /api/chat/rooms', () => {
    it('should create a chat room successfully', async () => {
      mockUser(1);

      const mockRoom = {
        id: 10, name: 'New Room', type: 'group',
        created_by: 1, created_at: '2025-03-10', updated_at: '2025-03-10',
      };

      transaction.mockImplementationOnce(async (cb) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockRoom] }) // INSERT room
            .mockResolvedValueOnce({ rows: [] })  // INSERT member 2
            .mockResolvedValueOnce({ rows: [] }), // INSERT member 1 (creator)
        };
        return cb(client);
      });

      const req = createRequest('POST', 'chat/rooms', {
        name: 'New Room',
        members: [2],
        type: 'group',
      }, AUTH);

      const res = await POST(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Chat room created successfully');
      expect(data.room.name).toBe('New Room');
      expect(data.room.members).toContain(1); // creator auto-added
      expect(data.room.members).toContain(2);
    });

    it('should return 400 when name is missing', async () => {
      mockUser(1);

      const req = createRequest('POST', 'chat/rooms', {
        members: [2],
      }, AUTH);

      const res = await POST(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Name and members required/);
    });

    it('should return 400 when members is empty', async () => {
      mockUser(1);

      const req = createRequest('POST', 'chat/rooms', {
        name: 'Test Room',
        members: [],
      }, AUTH);

      const res = await POST(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('POST', 'chat/rooms', {
        name: 'Room',
        members: [2],
      }, AUTH);

      const res = await POST(req, pathParams('chat/rooms'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // GET /api/chat/rooms/:id/messages
  // ==========================================
  describe('GET /api/chat/rooms/:id/messages', () => {
    it('should return messages for a room member', async () => {
      mockUser(1);

      // Membership check
      query.mockResolvedValueOnce({ rows: [{ room_id: 5, user_id: 1 }] });

      // Messages
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 101, room_id: 5, user_id: 2, user_email: 'user2@test.com',
            user_name: 'User 2', content: 'Hi there!', created_at: '2025-03-10T10:01:00',
          },
          {
            id: 100, room_id: 5, user_id: 1, user_email: 'user1@test.com',
            user_name: 'User 1', content: 'Hello', created_at: '2025-03-10T10:00:00',
          },
        ],
      });

      const req = createRequest('GET', 'chat/rooms/5/messages', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms/5/messages'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].content).toBe('Hello');
      expect(data.messages[1].userName).toBe('User 2');
    });

    it('should return 403 for non-member', async () => {
      mockUser(99);
      query.mockResolvedValueOnce({ rows: [] }); // not a member

      const req = createRequest('GET', 'chat/rooms/5/messages', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms/5/messages'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated user', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'chat/rooms/5/messages', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms/5/messages'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });

    it('should respect pagination limit', async () => {
      mockUser(1);
      query.mockResolvedValueOnce({ rows: [{ room_id: 5, user_id: 1 }] });
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('GET', 'chat/rooms/5/messages?limit=10', null, AUTH);
      const res = await GET(req, pathParams('chat/rooms/5/messages'));

      expect(res.status).toBe(200);
      // Verify the query was called with limit 10
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [expect.anything(), 10]
      );
    });
  });

  // ==========================================
  // POST /api/chat/messages
  // ==========================================
  describe('POST /api/chat/messages', () => {
    it('should send a message successfully', async () => {
      mockUser(1);

      // Member check
      query.mockResolvedValueOnce({ rows: [{ room_id: 5, user_id: 1 }] });
      // INSERT message
      query.mockResolvedValueOnce({
        rows: [{
          id: 200, room_id: 5, user_id: 1, content: 'Test message',
          created_at: '2025-03-10T12:00:00',
        }],
      });
      // UPDATE room updated_at
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('POST', 'chat/messages', {
        roomId: 5,
        content: 'Test message',
      }, AUTH);

      const res = await POST(req, pathParams('chat/messages'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Message sent successfully');
      expect(data.data.content).toBe('Test message');
      expect(data.data.roomId).toBe(5);
    });

    it('should return 400 when content is missing', async () => {
      mockUser(1);

      const req = createRequest('POST', 'chat/messages', {
        roomId: 5,
      }, AUTH);

      const res = await POST(req, pathParams('chat/messages'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Room ID and content required/);
    });

    it('should return 400 when roomId is missing', async () => {
      mockUser(1);

      const req = createRequest('POST', 'chat/messages', {
        content: 'Hello',
      }, AUTH);

      const res = await POST(req, pathParams('chat/messages'));
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should return 403 for non-member', async () => {
      mockUser(99);
      query.mockResolvedValueOnce({ rows: [] }); // not a member

      const req = createRequest('POST', 'chat/messages', {
        roomId: 5,
        content: 'Sneaky message',
      }, AUTH);

      const res = await POST(req, pathParams('chat/messages'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });
});

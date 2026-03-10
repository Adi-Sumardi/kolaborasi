/**
 * @jest-environment node
 */

/**
 * Users API Tests
 *
 * Tests for GET /api/users, PUT /api/users/:id,
 * PUT /api/users/:id/status, DELETE /api/users/:id
 */

import { GET, PUT, DELETE } from '@/app/api/[[...path]]/route';

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

const { query } = require('@/lib/db');
const jwt = require('jsonwebtoken');

function createRequest(method, path, body = null, headers = {}) {
  const url = `http://localhost:3000/api/${path}`;
  const options = {
    method,
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
  };
  if (body) options.body = JSON.stringify(body);
  return new Request(url, options);
}

function pathParams(p) {
  return { params: { path: p.split('/') } };
}

function mockSuperAdmin() {
  jwt.verify.mockReturnValueOnce({ userId: 1, email: 'admin@test.com', role: 'super_admin' });
}

function mockKaryawan() {
  jwt.verify.mockReturnValueOnce({ userId: 10, email: 'employee@test.com', role: 'karyawan' });
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };

describe('API: Users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/users
  // ==========================================
  describe('GET /api/users', () => {
    it('should list all active users for admin', async () => {
      mockSuperAdmin();

      const mockUsers = [
        { id: 1, email: 'admin@test.com', name: 'Admin', role: 'super_admin', division_id: null, is_active: true, profile_photo: null, monitor_code: '123456', created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 2, email: 'user@test.com', name: 'User', role: 'karyawan', division_id: 1, is_active: true, profile_photo: null, monitor_code: '654321', created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];

      query.mockResolvedValueOnce({ rows: mockUsers });

      const req = createRequest('GET', 'users', null, AUTH_HEADER);
      const res = await GET(req, pathParams('users'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.users).toHaveLength(2);
      expect(data.users[0].email).toBe('admin@test.com');
      expect(data.users[1].role).toBe('karyawan');
    });

    it('should return 403 for karyawan role', async () => {
      mockKaryawan();

      const req = createRequest('GET', 'users', null, AUTH_HEADER);
      const res = await GET(req, pathParams('users'));
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'users', null, AUTH_HEADER);
      const res = await GET(req, pathParams('users'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // PUT /api/users/:id
  // ==========================================
  describe('PUT /api/users/:id', () => {
    it('should update user profile successfully', async () => {
      mockSuperAdmin();

      // Check email uniqueness
      query.mockResolvedValueOnce({ rows: [] });
      // UPDATE query
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'users/5', {
        name: 'Updated Name',
        email: 'updated@test.com',
        role: 'pengurus',
      }, AUTH_HEADER);

      const res = await PUT(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('User updated successfully');
    });

    it('should return 400 when email is already in use', async () => {
      mockSuperAdmin();

      // Email already taken by another user
      query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

      const req = createRequest('PUT', 'users/5', {
        email: 'taken@test.com',
      }, AUTH_HEADER);

      const res = await PUT(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Email already in use');
    });

    it('should return 403 for unauthorized role', async () => {
      mockKaryawan();

      const req = createRequest('PUT', 'users/5', {
        name: 'Hack',
      }, AUTH_HEADER);

      const res = await PUT(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // PUT /api/users/:id/status
  // ==========================================
  describe('PUT /api/users/:id/status', () => {
    it('should activate a user', async () => {
      mockSuperAdmin();
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'users/5/status', { isActive: true }, AUTH_HEADER);
      const res = await PUT(req, pathParams('users/5/status'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toMatch(/enabled/);
    });

    it('should deactivate a user', async () => {
      mockSuperAdmin();
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'users/5/status', { isActive: false }, AUTH_HEADER);
      const res = await PUT(req, pathParams('users/5/status'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toMatch(/disabled/);
    });

    it('should return 403 for unauthorized role', async () => {
      mockKaryawan();

      const req = createRequest('PUT', 'users/5/status', { isActive: false }, AUTH_HEADER);
      const res = await PUT(req, pathParams('users/5/status'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // DELETE /api/users/:id
  // ==========================================
  describe('DELETE /api/users/:id', () => {
    it('should delete a user successfully (super_admin)', async () => {
      mockSuperAdmin();

      // User exists
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      // CASCADE cleanup queries (4 UPDATE + 1 DELETE)
      query.mockResolvedValue({ rows: [] });

      const req = createRequest('DELETE', 'users/5', null, AUTH_HEADER);
      const res = await DELETE(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('User deleted successfully');
    });

    it('should return 404 when user does not exist', async () => {
      mockSuperAdmin();
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('DELETE', 'users/999', null, AUTH_HEADER);
      const res = await DELETE(req, pathParams('users/999'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 400 when trying to delete yourself', async () => {
      // userId matches target
      jwt.verify.mockReturnValueOnce({ userId: 5, email: 'admin@test.com', role: 'super_admin' });

      const req = createRequest('DELETE', 'users/5', null, AUTH_HEADER);
      const res = await DELETE(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Cannot delete your own account');
    });

    it('should return 403 for non-super_admin', async () => {
      jwt.verify.mockReturnValueOnce({ userId: 2, email: 'pengurus@test.com', role: 'pengurus' });

      const req = createRequest('DELETE', 'users/5', null, AUTH_HEADER);
      const res = await DELETE(req, pathParams('users/5'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });
});

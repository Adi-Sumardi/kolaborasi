/**
 * @jest-environment node
 */

/**
 * Divisions API Tests
 *
 * Tests for GET /api/divisions, POST /api/divisions,
 * PUT /api/divisions/:id, DELETE /api/divisions/:id
 */

import { GET, POST, PUT, DELETE } from '@/app/api/[[...path]]/route';

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

function mockAdmin() {
  jwt.verify.mockReturnValueOnce({ userId: 1, email: 'admin@test.com', role: 'super_admin' });
}

function mockKaryawan() {
  jwt.verify.mockReturnValueOnce({ userId: 10, email: 'emp@test.com', role: 'karyawan' });
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('API: Divisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/divisions
  // ==========================================
  describe('GET /api/divisions', () => {
    it('should list all divisions with member count', async () => {
      mockAdmin();

      const mockDivisions = [
        {
          id: 1, name: 'Engineering', description: 'Software development',
          created_by: 1, created_at: '2025-01-01', updated_at: '2025-01-01',
          member_count: '5',
        },
        {
          id: 2, name: 'Marketing', description: 'Marketing team',
          created_by: 1, created_at: '2025-01-02', updated_at: '2025-01-02',
          member_count: '3',
        },
      ];

      query.mockResolvedValueOnce({ rows: mockDivisions });

      const req = createRequest('GET', 'divisions', null, AUTH);
      const res = await GET(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.divisions).toHaveLength(2);
      expect(data.divisions[0].name).toBe('Engineering');
      expect(data.divisions[0].memberCount).toBe(5);
      expect(data.divisions[1].memberCount).toBe(3);
    });

    it('should be accessible by any authenticated user', async () => {
      mockKaryawan();

      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('GET', 'divisions', null, AUTH);
      const res = await GET(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.divisions).toEqual([]);
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'divisions', null, AUTH);
      const res = await GET(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/divisions
  // ==========================================
  describe('POST /api/divisions', () => {
    it('should create a division successfully', async () => {
      mockAdmin();

      const mockDivision = {
        id: 5, name: 'Finance', description: 'Financial team',
        created_by: 1, created_at: '2025-03-10', updated_at: '2025-03-10',
      };

      query.mockResolvedValueOnce({ rows: [mockDivision] });

      const req = createRequest('POST', 'divisions', {
        name: 'Finance',
        description: 'Financial team',
      }, AUTH);

      const res = await POST(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Division created successfully');
      expect(data.division.name).toBe('Finance');
    });

    it('should return 400 when name is missing', async () => {
      mockAdmin();

      const req = createRequest('POST', 'divisions', {
        description: 'No name',
      }, AUTH);

      const res = await POST(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Division name required');
    });

    it('should return 403 for karyawan role', async () => {
      mockKaryawan();

      const req = createRequest('POST', 'divisions', {
        name: 'Hack Division',
      }, AUTH);

      const res = await POST(req, pathParams('divisions'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // PUT /api/divisions/:id
  // ==========================================
  describe('PUT /api/divisions/:id', () => {
    it('should update a division successfully', async () => {
      mockAdmin();
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const req = createRequest('PUT', 'divisions/3', {
        name: 'Engineering v2',
        description: 'Updated description',
      }, AUTH);

      const res = await PUT(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Division updated successfully');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE divisions'),
        ['Engineering v2', 'Updated description', '3']
      );
    });

    it('should return 400 when name is missing', async () => {
      mockAdmin();

      const req = createRequest('PUT', 'divisions/3', {
        description: 'Only desc',
      }, AUTH);

      const res = await PUT(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Division name required');
    });

    it('should return 403 for karyawan role', async () => {
      mockKaryawan();

      const req = createRequest('PUT', 'divisions/3', {
        name: 'Updated',
      }, AUTH);

      const res = await PUT(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // DELETE /api/divisions/:id
  // ==========================================
  describe('DELETE /api/divisions/:id', () => {
    it('should delete a division and unset users', async () => {
      mockAdmin();

      // UPDATE users SET division_id = NULL
      query.mockResolvedValueOnce({ rows: [] });
      // DELETE division
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('DELETE', 'divisions/3', null, AUTH);
      const res = await DELETE(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Division deleted successfully');

      // Verify users were unlinked first
      expect(query).toHaveBeenCalledWith(
        'UPDATE users SET division_id = NULL WHERE division_id = $1',
        ['3']
      );
    });

    it('should return 403 for karyawan role', async () => {
      mockKaryawan();

      const req = createRequest('DELETE', 'divisions/3', null, AUTH);
      const res = await DELETE(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });

    it('should return 403 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('DELETE', 'divisions/3', null, AUTH);
      const res = await DELETE(req, pathParams('divisions/3'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });
});

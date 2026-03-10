/**
 * @jest-environment node
 */

/**
 * Jobdesks API Tests
 *
 * Tests for GET /api/jobdesks, POST /api/jobdesks,
 * PUT /api/jobdesks/:id, PUT /api/jobdesks/:id/status, DELETE /api/jobdesks/:id
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

function mockAdmin() {
  jwt.verify.mockReturnValueOnce({ userId: 1, email: 'admin@test.com', role: 'super_admin' });
}

function mockKaryawan(userId = 10) {
  jwt.verify.mockReturnValueOnce({ userId, email: 'employee@test.com', role: 'karyawan' });
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('API: Jobdesks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/jobdesks
  // ==========================================
  describe('GET /api/jobdesks', () => {
    it('should return all jobdesks for admin', async () => {
      mockAdmin();

      const mockJobdesks = [
        {
          id: 1, title: 'Task A', description: 'Desc A', status: 'pending',
          priority: 'high', due_date: '2025-06-01', submission_link: null,
          created_by: 1, assigned_to: [10], client_id: null, client_name: null,
          client_npwp: null, is_pkp: false, is_umkm: false,
          period_month: null, period_year: null, task_types: ['reporting'],
          submission_count: '2', created_at: '2025-01-01', updated_at: '2025-01-01',
        },
      ];

      // COUNT query
      query.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      // DATA query
      query.mockResolvedValueOnce({ rows: mockJobdesks });

      const req = createRequest('GET', 'jobdesks', null, AUTH);
      const res = await GET(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.jobdesks).toHaveLength(1);
      expect(data.jobdesks[0].title).toBe('Task A');
      expect(data.pagination.totalCount).toBe(1);
    });

    it('should return only assigned jobdesks for karyawan', async () => {
      mockKaryawan(10);

      query.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      query.mockResolvedValueOnce({
        rows: [{
          id: 2, title: 'My Task', description: '', status: 'in_progress',
          priority: 'medium', due_date: null, submission_link: null,
          created_by: 1, assigned_to: [10], client_id: null, client_name: null,
          client_npwp: null, is_pkp: false, is_umkm: false,
          period_month: null, period_year: null, task_types: null,
          submission_count: '0', created_at: '2025-02-01', updated_at: '2025-02-01',
        }],
      });

      const req = createRequest('GET', 'jobdesks', null, AUTH);
      const res = await GET(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.jobdesks).toHaveLength(1);
      expect(data.jobdesks[0].title).toBe('My Task');
      // For karyawan, query uses user.userId filter
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1'),
        [10]
      );
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'jobdesks', null, AUTH);
      const res = await GET(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/jobdesks
  // ==========================================
  describe('POST /api/jobdesks', () => {
    it('should create a jobdesk successfully', async () => {
      mockAdmin();

      const mockCreatedJobdesk = {
        id: 10,
        title: 'New Task',
        description: 'Task description',
        status: 'pending',
        priority: 'high',
        due_date: '2025-12-31',
        submission_link: null,
        created_by: 1,
        period_month: null,
        period_year: null,
        task_types: null,
        created_at: '2025-03-01',
      };

      // transaction mock executes the callback
      transaction.mockImplementationOnce(async (cb) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockCreatedJobdesk] }) // INSERT jobdesk
            .mockResolvedValueOnce({ rows: [] }) // INSERT assignment
            .mockResolvedValueOnce({ rows: [] }), // INSERT notification
        };
        return cb(client);
      });

      const req = createRequest('POST', 'jobdesks', {
        title: 'New Task',
        description: 'Task description',
        assignedTo: [10],
        priority: 'high',
        dueDate: '2025-12-31',
      }, AUTH);

      const res = await POST(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Jobdesk created successfully');
      expect(data.jobdesk.title).toBe('New Task');
    });

    it('should return 400 when title is missing', async () => {
      mockAdmin();

      const req = createRequest('POST', 'jobdesks', {
        description: 'No title',
        assignedTo: [10],
      }, AUTH);

      const res = await POST(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Title and at least one assignee required/);
    });

    it('should return 400 when assignedTo is empty', async () => {
      mockAdmin();

      const req = createRequest('POST', 'jobdesks', {
        title: 'Test',
        assignedTo: [],
      }, AUTH);

      const res = await POST(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('POST', 'jobdesks', {
        title: 'Test',
        assignedTo: [1],
      }, AUTH);

      const res = await POST(req, pathParams('jobdesks'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // PUT /api/jobdesks/:id
  // ==========================================
  describe('PUT /api/jobdesks/:id', () => {
    it('should update a jobdesk for admin', async () => {
      mockAdmin();

      // SELECT existing jobdesk
      query.mockResolvedValueOnce({
        rows: [{
          id: 10, title: 'Old Title', assigned_to: [10], created_by: 1,
        }],
      });
      // UPDATE jobdesks SET ...
      query.mockResolvedValueOnce({ rows: [] });
      // SELECT updated jobdesk
      query.mockResolvedValueOnce({
        rows: [{
          id: 10, title: 'Updated Title', description: 'Updated desc',
          status: 'in_progress', priority: 'high', due_date: null,
          submission_link: null, assigned_to: [10], created_by: 1,
          created_at: '2025-01-01', updated_at: '2025-03-01',
        }],
      });

      const req = createRequest('PUT', 'jobdesks/10', {
        title: 'Updated Title',
        description: 'Updated desc',
        status: 'in_progress',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/10'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Jobdesk updated successfully');
      expect(data.jobdesk.title).toBe('Updated Title');
    });

    it('should return 404 when jobdesk does not exist', async () => {
      mockAdmin();
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'jobdesks/999', {
        title: 'Nope',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/999'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Jobdesk not found');
    });

    it('should return 403 for unassigned karyawan', async () => {
      mockKaryawan(99); // userId 99 is not assigned

      query.mockResolvedValueOnce({
        rows: [{ id: 10, title: 'Task', assigned_to: [10], created_by: 1 }],
      });

      const req = createRequest('PUT', 'jobdesks/10', {
        title: 'Hacked',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/10'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // PUT /api/jobdesks/:id/status
  // ==========================================
  describe('PUT /api/jobdesks/:id/status', () => {
    it('should update jobdesk status for assigned user', async () => {
      mockKaryawan(10);

      // Check assignment
      query.mockResolvedValueOnce({ rows: [{ jobdesk_id: 5, user_id: 10 }] });
      // UPDATE status
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'jobdesks/5/status', {
        status: 'in_progress',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/5/status'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('in_progress');
    });

    it('should return 400 for invalid status value', async () => {
      mockKaryawan(10);

      const req = createRequest('PUT', 'jobdesks/5/status', {
        status: 'invalid_status',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/5/status'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Invalid status');
    });

    it('should return 403 when user is not assigned', async () => {
      mockKaryawan(10);

      query.mockResolvedValueOnce({ rows: [] }); // no assignment found

      const req = createRequest('PUT', 'jobdesks/5/status', {
        status: 'completed',
      }, AUTH);

      const res = await PUT(req, pathParams('jobdesks/5/status'));
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toMatch(/Not assigned/);
    });
  });

  // ==========================================
  // DELETE /api/jobdesks/:id
  // ==========================================
  describe('DELETE /api/jobdesks/:id', () => {
    it('should delete a jobdesk for super_admin', async () => {
      mockAdmin();

      // Jobdesk exists
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      // Get attachments
      query.mockResolvedValueOnce({ rows: [] });
      // DELETE jobdesk
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('DELETE', 'jobdesks/5', null, AUTH);
      const res = await DELETE(req, pathParams('jobdesks/5'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Jobdesk deleted successfully');
      expect(data.deletedJobdeskId).toBe('5');
    });

    it('should return 404 when jobdesk not found', async () => {
      mockAdmin();
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('DELETE', 'jobdesks/999', null, AUTH);
      const res = await DELETE(req, pathParams('jobdesks/999'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Jobdesk not found');
    });

    it('should return 403 for karyawan', async () => {
      mockKaryawan();

      const req = createRequest('DELETE', 'jobdesks/5', null, AUTH);
      const res = await DELETE(req, pathParams('jobdesks/5'));
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });
});

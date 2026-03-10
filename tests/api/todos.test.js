/**
 * @jest-environment node
 */

/**
 * Todos API Tests
 *
 * Tests for GET /api/todos, POST /api/todos,
 * PUT /api/todos/:id, DELETE /api/todos/:id,
 * POST /api/todos/:id/convert-to-log
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

function mockUser(userId = 1) {
  jwt.verify.mockReturnValueOnce({ userId, email: `user${userId}@test.com`, role: 'karyawan' });
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('API: Todos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/todos
  // ==========================================
  describe('GET /api/todos', () => {
    it('should list todos for the authenticated user', async () => {
      mockUser(1);

      const mockTodos = [
        {
          id: 1, user_id: 1, jobdesk_id: 10, title: 'Fix bug',
          description: 'Fix login bug', status: 'pending', priority: 'high',
          due_date: '2025-06-01', order: 1, created_at: '2025-03-01',
          updated_at: '2025-03-01',
        },
        {
          id: 2, user_id: 1, jobdesk_id: null, title: 'Read docs',
          description: '', status: 'done', priority: 'low',
          due_date: null, order: 2, created_at: '2025-03-02',
          updated_at: '2025-03-05',
        },
      ];

      query.mockResolvedValueOnce({ rows: mockTodos });

      const req = createRequest('GET', 'todos', null, AUTH);
      const res = await GET(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.todos).toHaveLength(2);
      expect(data.todos[0].title).toBe('Fix bug');
      expect(data.todos[0].priority).toBe('high');
      expect(data.todos[1].status).toBe('done');
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('GET', 'todos', null, AUTH);
      const res = await GET(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });

    it('should return empty list when user has no todos', async () => {
      mockUser(99);
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('GET', 'todos', null, AUTH);
      const res = await GET(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.todos).toEqual([]);
    });
  });

  // ==========================================
  // POST /api/todos
  // ==========================================
  describe('POST /api/todos', () => {
    it('should create a todo successfully', async () => {
      mockUser(1);

      const mockTodo = {
        id: 10, user_id: 1, title: 'New Todo', description: 'Details',
        status: 'pending', priority: 'medium', due_date: '2025-06-15',
        jobdesk_id: 5, created_at: '2025-03-10', updated_at: '2025-03-10',
      };

      query.mockResolvedValueOnce({ rows: [mockTodo] });

      const req = createRequest('POST', 'todos', {
        title: 'New Todo',
        description: 'Details',
        priority: 'medium',
        dueDate: '2025-06-15',
        jobdeskId: 5,
      }, AUTH);

      const res = await POST(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Todo created successfully');
      expect(data.todo.title).toBe('New Todo');
      expect(data.todo.jobdeskId).toBe(5);
    });

    it('should create a todo with defaults when optional fields are omitted', async () => {
      mockUser(1);

      const mockTodo = {
        id: 11, user_id: 1, title: 'Minimal Todo', description: '',
        status: 'pending', priority: 'medium', due_date: null,
        jobdesk_id: null, created_at: '2025-03-10', updated_at: '2025-03-10',
      };

      query.mockResolvedValueOnce({ rows: [mockTodo] });

      const req = createRequest('POST', 'todos', {
        title: 'Minimal Todo',
      }, AUTH);

      const res = await POST(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.todo.status).toBe('pending');
      expect(data.todo.priority).toBe('medium');
    });

    it('should return 400 when title is missing', async () => {
      mockUser(1);

      const req = createRequest('POST', 'todos', {
        description: 'No title here',
      }, AUTH);

      const res = await POST(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Title required');
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('POST', 'todos', {
        title: 'Test',
      }, AUTH);

      const res = await POST(req, pathParams('todos'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // PUT /api/todos/:id
  // ==========================================
  describe('PUT /api/todos/:id', () => {
    it('should update a todo successfully', async () => {
      mockUser(1);
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const req = createRequest('PUT', 'todos/10', {
        title: 'Updated Todo',
        status: 'done',
        priority: 'high',
      }, AUTH);

      const res = await PUT(req, pathParams('todos/10'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Todo updated successfully');
    });

    it('should update only provided fields', async () => {
      mockUser(1);
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('PUT', 'todos/10', {
        status: 'in_progress',
      }, AUTH);

      const res = await PUT(req, pathParams('todos/10'));
      const data = await res.json();

      expect(res.status).toBe(200);
      // Verify the query only updates status
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['in_progress'])
      );
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('PUT', 'todos/10', {
        title: 'Update',
      }, AUTH);

      const res = await PUT(req, pathParams('todos/10'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // DELETE /api/todos/:id
  // ==========================================
  describe('DELETE /api/todos/:id', () => {
    it('should delete a todo owned by the user', async () => {
      mockUser(1);

      // Todo exists and belongs to user
      query.mockResolvedValueOnce({ rows: [{ id: 10 }] });
      // DELETE
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('DELETE', 'todos/10', null, AUTH);
      const res = await DELETE(req, pathParams('todos/10'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Todo deleted successfully');
      expect(data.deletedId).toBe('10');
    });

    it('should return 404 when todo does not exist or belongs to another user', async () => {
      mockUser(1);
      query.mockResolvedValueOnce({ rows: [] }); // not found

      const req = createRequest('DELETE', 'todos/999', null, AUTH);
      const res = await DELETE(req, pathParams('todos/999'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Todo not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('DELETE', 'todos/10', null, AUTH);
      const res = await DELETE(req, pathParams('todos/10'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/todos/:id/convert-to-log
  // ==========================================
  describe('POST /api/todos/:id/convert-to-log', () => {
    it('should convert a completed todo to daily log', async () => {
      mockUser(1);

      // GET todo
      query.mockResolvedValueOnce({
        rows: [{
          id: 10, user_id: 1, jobdesk_id: 5, title: 'Fix bug',
          description: 'Fixed the login issue', status: 'done',
        }],
      });

      // INSERT daily log
      query.mockResolvedValueOnce({
        rows: [{
          id: 50, user_id: 1, jobdesk_id: 5,
          activity: '**[From To-Do]** Fix bug\n\nFixed the login issue',
          hours_spent: '2.5', date: '2025-03-10', created_at: '2025-03-10',
        }],
      });

      const req = createRequest('POST', 'todos/10/convert-to-log', {
        hoursSpent: 2.5,
      }, AUTH);

      const res = await POST(req, pathParams('todos/10/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Todo converted to log successfully');
      expect(data.log.hoursSpent).toBe(2.5);
      expect(data.log.jobdeskId).toBe(5);
    });

    it('should return 400 when hoursSpent is missing or zero', async () => {
      mockUser(1);

      const req = createRequest('POST', 'todos/10/convert-to-log', {
        hoursSpent: 0,
      }, AUTH);

      const res = await POST(req, pathParams('todos/10/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Hours spent must be greater than 0/);
    });

    it('should return 404 when todo not found', async () => {
      mockUser(1);
      query.mockResolvedValueOnce({ rows: [] });

      const req = createRequest('POST', 'todos/999/convert-to-log', {
        hoursSpent: 1,
      }, AUTH);

      const res = await POST(req, pathParams('todos/999/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Todo not found');
    });

    it('should return 400 when todo has no jobdesk', async () => {
      mockUser(1);

      query.mockResolvedValueOnce({
        rows: [{
          id: 10, user_id: 1, jobdesk_id: null, title: 'Standalone todo',
          description: '', status: 'done',
        }],
      });

      const req = createRequest('POST', 'todos/10/convert-to-log', {
        hoursSpent: 1,
      }, AUTH);

      const res = await POST(req, pathParams('todos/10/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/must have a jobdesk/);
    });

    it('should return 400 when todo is not in done status', async () => {
      mockUser(1);

      query.mockResolvedValueOnce({
        rows: [{
          id: 10, user_id: 1, jobdesk_id: 5, title: 'Pending todo',
          description: '', status: 'pending',
        }],
      });

      const req = createRequest('POST', 'todos/10/convert-to-log', {
        hoursSpent: 1,
      }, AUTH);

      const res = await POST(req, pathParams('todos/10/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/must be in done status/);
    });

    it('should return 401 for unauthenticated request', async () => {
      jwt.verify.mockImplementationOnce(() => { throw new Error('invalid'); });

      const req = createRequest('POST', 'todos/10/convert-to-log', {
        hoursSpent: 1,
      }, AUTH);

      const res = await POST(req, pathParams('todos/10/convert-to-log'));
      const data = await res.json();

      expect(res.status).toBe(401);
    });
  });
});

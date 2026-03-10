/**
 * Unit tests for lib/api.js
 * Tests token management, Electron integration, and API request helpers
 */
import {
  getToken,
  setToken,
  removeToken,
  notifyElectronAuth,
  getUser,
  setUser,
  removeUser,
  authAPI,
  divisionAPI,
  userAPI,
  todoAPI,
  chatAPI,
  notificationAPI,
  clientAPI,
  taxPeriodAPI,
  kpiV2API,
  dailyLogAPI,
  jobdeskAPI,
  attachmentAPI,
  profileAPI,
} from '@/lib/api';

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch = jest.fn();
  delete window.location;
  window.location = { href: '' };
  window.electronAPI = undefined;
});

// ============================================================
// Token Management
// ============================================================
describe('Token Management', () => {
  describe('setToken()', () => {
    it('should store token in localStorage', () => {
      setToken('abc123');
      expect(localStorage.setItem).toHaveBeenCalledWith('token', 'abc123');
    });

    it('should handle empty string token', () => {
      setToken('');
      expect(localStorage.setItem).toHaveBeenCalledWith('token', '');
    });
  });

  describe('getToken()', () => {
    it('should retrieve token from localStorage', () => {
      localStorage.setItem('token', 'abc123');
      expect(getToken()).toBe('abc123');
    });

    it('should return null when no token exists', () => {
      expect(getToken()).toBeNull();
    });
  });

  describe('removeToken()', () => {
    it('should remove token from localStorage', () => {
      removeToken();
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });

    it('should call electronAPI.notifyLogout when Electron is available', () => {
      const notifyLogout = jest.fn();
      window.electronAPI = { isElectron: true, notifyLogout };

      removeToken();

      expect(notifyLogout).toHaveBeenCalled();
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });

    it('should not call electronAPI.notifyLogout when Electron is not available', () => {
      window.electronAPI = undefined;
      removeToken();
      // Should not throw
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });

    it('should not call notifyLogout when isElectron is false', () => {
      const notifyLogout = jest.fn();
      window.electronAPI = { isElectron: false, notifyLogout };

      removeToken();

      expect(notifyLogout).not.toHaveBeenCalled();
    });
  });
});

// ============================================================
// User Management
// ============================================================
describe('User Management', () => {
  describe('setUser()', () => {
    it('should store serialized user in localStorage', () => {
      const user = { id: 1, name: 'Test' };
      setUser(user);
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user));
    });
  });

  describe('getUser()', () => {
    it('should parse and return user from localStorage', () => {
      const user = { id: 1, name: 'Test' };
      localStorage.setItem('user', JSON.stringify(user));
      expect(getUser()).toEqual(user);
    });

    it('should return null when no user stored', () => {
      expect(getUser()).toBeNull();
    });
  });

  describe('removeUser()', () => {
    it('should remove user from localStorage', () => {
      removeUser();
      expect(localStorage.removeItem).toHaveBeenCalledWith('user');
    });
  });
});

// ============================================================
// Electron Integration
// ============================================================
describe('notifyElectronAuth()', () => {
  it('should call electronAPI.notifyLogin with token and user', () => {
    const notifyLogin = jest.fn();
    window.electronAPI = { isElectron: true, notifyLogin };

    const user = { id: 1, name: 'Admin' };
    notifyElectronAuth('token123', user);

    expect(notifyLogin).toHaveBeenCalledWith('token123', user);
  });

  it('should not call notifyLogin when electronAPI is not available', () => {
    window.electronAPI = undefined;
    // Should not throw
    notifyElectronAuth('token123', { id: 1 });
  });

  it('should not call notifyLogin when isElectron is false', () => {
    const notifyLogin = jest.fn();
    window.electronAPI = { isElectron: false, notifyLogin };

    notifyElectronAuth('token123', { id: 1 });
    expect(notifyLogin).not.toHaveBeenCalled();
  });

  it('should not call notifyLogin when token is falsy', () => {
    const notifyLogin = jest.fn();
    window.electronAPI = { isElectron: true, notifyLogin };

    notifyElectronAuth(null, { id: 1 });
    expect(notifyLogin).not.toHaveBeenCalled();
  });

  it('should not call notifyLogin when user has no id', () => {
    const notifyLogin = jest.fn();
    window.electronAPI = { isElectron: true, notifyLogin };

    notifyElectronAuth('token123', { name: 'No ID' });
    expect(notifyLogin).not.toHaveBeenCalled();
  });
});

// ============================================================
// apiRequest (tested through API helpers)
// ============================================================
describe('apiRequest — via API helpers', () => {
  const mockJsonResponse = (body, ok = true, status = 200) => {
    global.fetch.mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(body),
    });
  };

  it('should include Authorization header when token exists', async () => {
    localStorage.setItem('token', 'mytoken');
    mockJsonResponse({ success: true });

    await authAPI.getMe();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mytoken',
        }),
      })
    );
  });

  it('should not include Authorization header when no token', async () => {
    mockJsonResponse({ success: true });

    await authAPI.getMe();

    const callHeaders = global.fetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it('should throw on non-OK response', async () => {
    mockJsonResponse({ error: 'Not found' }, false, 404);

    await expect(divisionAPI.getAll()).rejects.toThrow('Not found');
  });

  it('should throw generic error when no error message in response', async () => {
    mockJsonResponse({}, false, 500);

    await expect(divisionAPI.getAll()).rejects.toThrow('Something went wrong');
  });

  it('should redirect to / and clear tokens on 401', async () => {
    localStorage.setItem('token', 'expired-token');
    mockJsonResponse({ error: 'Unauthorized' }, false, 401);

    await expect(userAPI.getAll()).rejects.toThrow('Unauthorized');

    expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('user');
    // jsdom resolves '/' to the full URL 'http://localhost/'
    expect(window.location.href).toMatch(/\/$/);
    expect(window.location.pathname || new URL(window.location.href).pathname).toBe('/');
  });

  it('should send JSON body for POST requests', async () => {
    localStorage.setItem('token', 'tok');
    mockJsonResponse({ id: 1, title: 'New Todo' });

    const data = { title: 'New Todo' };
    await todoAPI.create(data);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/todos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      })
    );
  });
});

// ============================================================
// API Helper Functions — verify correct endpoints and methods
// ============================================================
describe('authAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  };

  it('login sends POST to auth/login', async () => {
    mockOk({ token: 'new' });
    await authAPI.login({ email: 'a@b.com', password: '123' });
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('register sends POST to auth/register', async () => {
    mockOk({});
    await authAPI.register({ name: 'X' });
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
  });

  it('getMe sends GET to auth/me', async () => {
    mockOk({ user: {} });
    await authAPI.getMe();
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.any(Object));
  });

  it('enable2FA sends POST with code', async () => {
    mockOk({});
    await authAPI.enable2FA('123456');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/2fa/enable',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      })
    );
  });
});

describe('divisionAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getAll fetches divisions', async () => {
    mockOk([]);
    await divisionAPI.getAll();
    expect(global.fetch).toHaveBeenCalledWith('/api/divisions', expect.any(Object));
  });

  it('create sends POST', async () => {
    mockOk({});
    await divisionAPI.create({ name: 'HR' });
    expect(global.fetch).toHaveBeenCalledWith('/api/divisions', expect.objectContaining({ method: 'POST' }));
  });

  it('update sends PUT with id', async () => {
    mockOk({});
    await divisionAPI.update(5, { name: 'IT' });
    expect(global.fetch).toHaveBeenCalledWith('/api/divisions/5', expect.objectContaining({ method: 'PUT' }));
  });

  it('delete sends DELETE with id', async () => {
    mockOk({});
    await divisionAPI.delete(5);
    expect(global.fetch).toHaveBeenCalledWith('/api/divisions/5', expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('userAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getAll fetches /users', async () => {
    mockOk([]);
    await userAPI.getAll();
    expect(global.fetch).toHaveBeenCalledWith('/api/users', expect.any(Object));
  });

  it('getList fetches /users/list', async () => {
    mockOk([]);
    await userAPI.getList();
    expect(global.fetch).toHaveBeenCalledWith('/api/users/list', expect.any(Object));
  });

  it('updateStatus sends PUT to /users/:id/status', async () => {
    mockOk({});
    await userAPI.updateStatus(3, false);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/users/3/status',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ isActive: false }),
      })
    );
  });

  it('changePassword sends PUT to /users/:id/password', async () => {
    mockOk({});
    await userAPI.changePassword(3, 'newpass');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/users/3/password',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ newPassword: 'newpass' }) })
    );
  });
});

describe('todoAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('convertToLog sends POST with hoursSpent', async () => {
    mockOk({});
    await todoAPI.convertToLog(7, 3);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/todos/7/convert-to-log',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hoursSpent: 3 }),
      })
    );
  });
});

describe('chatAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getMessages includes limit in URL', async () => {
    mockOk([]);
    await chatAPI.getMessages('room1', 25);
    expect(global.fetch).toHaveBeenCalledWith('/api/chat/rooms/room1/messages?limit=25', expect.any(Object));
  });

  it('sendMessage sends POST to chat/messages', async () => {
    mockOk({});
    await chatAPI.sendMessage({ roomId: 'r1', content: 'hi' });
    expect(global.fetch).toHaveBeenCalledWith('/api/chat/messages', expect.objectContaining({ method: 'POST' }));
  });
});

describe('clientAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getAll with params appends query string', async () => {
    mockOk({ data: [] });
    await clientAPI.getAll({ search: 'abc' });
    expect(global.fetch).toHaveBeenCalledWith('/api/clients?search=abc', expect.any(Object));
  });

  it('assignEmployee sends POST', async () => {
    mockOk({});
    await clientAPI.assignEmployee('c1', 'u1', true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/clients/c1/assign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'u1', isPrimary: true }),
      })
    );
  });

  it('unassignEmployee sends DELETE', async () => {
    mockOk({});
    await clientAPI.unassignEmployee('c1', 'u1');
    expect(global.fetch).toHaveBeenCalledWith('/api/clients/c1/assign/u1', expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('dailyLogAPI', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getAll without params fetches /daily-logs', async () => {
    mockOk([]);
    await dailyLogAPI.getAll();
    expect(global.fetch).toHaveBeenCalledWith('/api/daily-logs', expect.any(Object));
  });

  it('getAll with params appends query string', async () => {
    mockOk([]);
    await dailyLogAPI.getAll({ month: '1', year: '2025' });
    expect(global.fetch).toHaveBeenCalledWith('/api/daily-logs?month=1&year=2025', expect.any(Object));
  });
});

describe('kpiV2API', () => {
  const mockOk = (body = {}) => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  it('getData with params', async () => {
    mockOk({});
    await kpiV2API.getData({ userId: '1' });
    expect(global.fetch).toHaveBeenCalledWith('/api/kpi-v2?userId=1', expect.any(Object));
  });

  it('getSummary fetches summary endpoint', async () => {
    mockOk({});
    await kpiV2API.getSummary();
    expect(global.fetch).toHaveBeenCalledWith('/api/kpi-v2/summary', expect.any(Object));
  });
});

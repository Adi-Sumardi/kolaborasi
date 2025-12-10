// API Helper functions
const API_URL = '/api';

// Get token from localStorage
export const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Set token to localStorage
export const setToken = (token) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
  }
};

// Remove token from localStorage
export const removeToken = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
};

// Get user from localStorage
export const getUser = () => {
  if (typeof window !== 'undefined') {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }
  return null;
};

// Set user to localStorage
export const setUser = (user) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
};

// Remove user from localStorage
export const removeUser = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user');
  }
};

// API request helper
const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
};

// Auth API
export const authAPI = {
  login: (credentials) => apiRequest('auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  
  register: (userData) => apiRequest('auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),
  
  getMe: () => apiRequest('auth/me'),
  
  get2FAQRCode: () => apiRequest('auth/2fa/qrcode'),
  
  enable2FA: (code) => apiRequest('auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }),
};

// Division API
export const divisionAPI = {
  getAll: () => apiRequest('divisions'),
  
  create: (data) => apiRequest('divisions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id, data) => apiRequest(`divisions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  delete: (id) => apiRequest(`divisions/${id}`, {
    method: 'DELETE',
  }),
};

// Jobdesk API
export const jobdeskAPI = {
  getAll: () => apiRequest('jobdesks'),
  
  create: (data) => apiRequest('jobdesks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  updateStatus: (id, status) => apiRequest(`jobdesks/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),
};

// Daily Log API
export const dailyLogAPI = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`daily-logs${queryString ? `?${queryString}` : ''}`);
  },
  
  create: (data) => apiRequest('daily-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// KPI API
export const kpiAPI = {
  get: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`kpi${queryString ? `?${queryString}` : ''}`);
  },
};

// User API
export const userAPI = {
  getAll: () => apiRequest('users'),
  
  create: (data) => apiRequest('auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id, data) => apiRequest(`users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  updateStatus: (id, isActive) => apiRequest(`users/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ isActive }),
  }),
  
  updateDivision: (id, divisionId) => apiRequest(`users/${id}/division`, {
    method: 'PUT',
    body: JSON.stringify({ divisionId }),
  }),
  
  delete: (id) => apiRequest(`users/${id}`, {
    method: 'DELETE',
  }),
};

// Todo API
export const todoAPI = {
  getAll: () => apiRequest('todos'),
  
  create: (data) => apiRequest('todos', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id, data) => apiRequest(`todos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Chat API
export const chatAPI = {
  getRooms: () => apiRequest('chat/rooms'),
  
  createRoom: (data) => apiRequest('chat/rooms', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  getMessages: (roomId, limit = 50) => apiRequest(`chat/rooms/${roomId}/messages?limit=${limit}`),
  
  sendMessage: (data) => apiRequest('chat/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Notification API
export const notificationAPI = {
  getAll: () => apiRequest('notifications'),
  
  markAsRead: (id) => apiRequest(`notifications/${id}/read`, {
    method: 'PUT',
  }),
};

// Attachment API
export const attachmentAPI = {
  getAll: (jobdeskId) => apiRequest(`jobdesks/${jobdeskId}/attachments`),
  
  createLink: (jobdeskId, data) => apiRequest(`jobdesks/${jobdeskId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  createFile: async (jobdeskId, file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'file');
    
    const response = await fetch(`/api/jobdesks/${jobdeskId}/attachments/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    return data;
  },
  
  delete: (id) => apiRequest(`attachments/${id}`, {
    method: 'DELETE',
  }),
};

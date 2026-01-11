import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (data) => api.post('/api/auth/register', data),
  me: () => api.get('/api/auth/me'),
};

// User API
export const userAPI = {
  getAll: (params) => api.get('/api/users', { params }),
  getById: (id) => api.get(`/api/users/${id}`),
  updateStatus: (id, status) => api.patch(`/api/users/${id}/status`, { status }),
  updateRole: (id, role) => api.patch(`/api/users/${id}/role`, { role }),
  update: (id, data) => api.patch(`/api/users/${id}`, data),
  delete: (id) => api.delete(`/api/users/${id}`),
};

// Team API
export const teamAPI = {
  getAll: () => api.get('/api/teams'),
  getById: (id) => api.get(`/api/teams/${id}`),
  create: (data) => api.post('/api/teams', data),
  update: (id, data) => api.put(`/api/teams/${id}`, data),
  delete: (id) => api.delete(`/api/teams/${id}`),
  addMember: (id, userId) => api.post(`/api/teams/${id}/members`, { userId }),
  removeMember: (id, userId) => api.delete(`/api/teams/${id}/members/${userId}`),
};

// Task API
export const taskAPI = {
  getAll: (params) => api.get('/api/tasks', { params }),
  getMyTasks: (params) => api.get('/api/tasks/my-tasks', { params }),
  getById: (id) => api.get(`/api/tasks/${id}`),
  create: (data) => api.post('/api/tasks', data),
  update: (id, data) => api.put(`/api/tasks/${id}`, data),
  delete: (id) => api.delete(`/api/tasks/${id}`),
  addComment: (id, content) => api.post(`/api/tasks/${id}/comments`, { content }),
  getComments: (id) => api.get(`/api/tasks/${id}/comments`),
};

export default api;

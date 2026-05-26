import axios from 'axios';

// Single shared axios instance for all API calls
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Request interceptor: attach JWT auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateSettings: (data) => api.put('/auth/settings', data),
};
export const accountsAPI = {
  list: () => api.get('/accounts'),
  disconnect: (id) => api.delete(`/accounts/${id}`),
  facebookAuth: () => api.get('/accounts/facebook'),
  instagramAuth: () => api.get('/accounts/instagram'),
  pinterestAuth: () => api.get('/accounts/pinterest'),
  twitterAuth: () => api.get('/accounts/twitter'),
  tumblrAuth: () => api.get('/accounts/tumblr'),
  connectFacebook: (data) => api.post('/accounts/connect-facebook', data),
  connectInstagramPrivate: (data) => api.post('/accounts/connect-instagram-private', data),
};
export const postsAPI = {
  list: (params) => api.get('/posts', { params }),
  create: (data) => api.post('/posts', data),
  update: (id, data) => api.put(`/posts/${id}`, data),
  remove: (id) => api.delete(`/posts/${id}`),
};

// Upload API — uses the SAME shared instance so auth token is always included.
// Do NOT manually set Content-Type here; axios auto-sets multipart/form-data
// with the correct boundary when the body is a FormData object.
export const uploadAPI = {
  upload: (formData) => api.post('/upload', formData),
  generateCaption: (data) => api.post('/upload/generate-caption', data),
};
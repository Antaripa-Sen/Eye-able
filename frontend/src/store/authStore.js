import { create } from 'zustand';

const API = import.meta.env.VITE_API_URL || '/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('eyeable_token'),
  loading: true,

  setAuth: (user, token) => {
    localStorage.setItem('eyeable_token', token);
    set({ user, token, loading: false });
  },

  logout: () => {
    localStorage.removeItem('eyeable_token');
    set({ user: null, token: null, loading: false });
  },

  fetchMe: async () => {
    const token = get().token;
    if (!token) return set({ loading: false });
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Unauthorized');
      const { user } = await res.json();
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('eyeable_token');
      set({ user: null, token: null, loading: false });
    }
  },

  authFetch: (url, options = {}) => {
    const token = get().token;
    return fetch(`${API}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  }
}));

export default useAuthStore;

import { create } from 'zustand';
import { api } from '../lib/api-client';

interface User {
  id: string;
  email: string;
  nom: string;
  prenom: string | null;
  role: 'ADMIN' | 'MANAGER' | 'RECRUTEUR';
  mustChangePassword: boolean;
  onboardingCompleted?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: (() => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  })(),
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<{ accessToken: string; user: User }>('/auth/login', {
        email,
        password,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.put('/auth/change-password', { currentPassword, newPassword });
    set((state) => ({
      user: state.user ? { ...state.user, mustChangePassword: false } : null,
    }));
    localStorage.setItem(
      'user',
      JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), mustChangePassword: false }),
    );
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
}));

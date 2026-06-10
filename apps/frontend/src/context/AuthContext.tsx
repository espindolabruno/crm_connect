'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAPI } from '../lib/api';
import { AuthUser } from '@crm/types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (accountName: string, userName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('crm_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchAPI('/auth/me');
        setUser(data.user);
      } catch (err) {
        console.error('Falha ao autenticar token:', err);
        localStorage.removeItem('crm_token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('crm_token', data.token);
      setUser(data.user);
      router.push('/');
    } catch (err) {
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (accountName: string, userName: string, email: string, password: string) => {
    setLoading(true);
    try {
      const data = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ accountName, userName, email, password }),
      });
      localStorage.setItem('crm_token', data.token);
      setUser(data.user);
      router.push('/');
    } catch (err) {
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('crm_token');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

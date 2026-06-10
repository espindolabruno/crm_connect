'use client';

import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecting
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20">
            C
          </div>
          <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-indigo-200 to-slate-200 bg-clip-text text-transparent">
            CRM de Conversão
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-200">{user.name}</p>
            <p className="text-xs text-slate-400">Owner</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium hover:bg-slate-800/80 transition cursor-pointer"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Dashboard Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 z-10 relative">
        {/* Welcome Section */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-8 rounded-2xl">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Olá, {user.name}! 👋
          </h1>
          <p className="text-slate-400 mt-2">
            Bem-vindo ao painel da sua empresa no CRM de Conversão.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <div className="bg-slate-950/80 border border-slate-900 px-6 py-4 rounded-xl flex-1 min-w-[200px]">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Empresa</span>
              <span className="text-lg font-bold text-indigo-400 mt-1 block">Minha Conta</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-900 px-6 py-4 rounded-xl flex-1 min-w-[200px]">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">ID da Conta</span>
              <span className="text-sm font-mono text-slate-300 mt-1 block select-all">{user.accountId}</span>
            </div>
          </div>
        </div>

        {/* Feature Preview Message */}
        <div className="border border-indigo-500/20 bg-indigo-500/5 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white">Fase 1 - Inicialização Concluída!</h3>
            <p className="text-sm text-slate-300 mt-1">
              A estrutura do monorepo, banco de dados (Prisma/PostgreSQL) e autenticação estão funcionando perfeitamente.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Banco Conectado
            </span>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Auth Ativo
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

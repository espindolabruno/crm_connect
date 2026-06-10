'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchAPI } from '../../lib/api';
import { 
  Sparkles, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Save, 
  ArrowUp, 
  ArrowDown, 
  Sliders 
} from 'lucide-react';

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  // Settings state
  const [primaryProvider, setPrimaryProvider] = useState<'CLAUDE' | 'GEMINI' | 'OPENAI'>('CLAUDE');
  const [fallbackOrder, setFallbackOrder] = useState<string[]>(['GEMINI', 'OPENAI']);
  
  const [claudeModel, setClaudeModel] = useState('claude-3-5-sonnet-20240620');
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');

  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  // UI state
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fetchError, setFetchError] = useState('');

  // Initial config loaded status
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'OWNER') {
        router.push('/');
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'OWNER') {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const data = await fetchAPI('/ai-config');
      setPrimaryProvider(data.primaryProvider);
      
      const fallbacks = data.fallbackOrder 
        ? data.fallbackOrder.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
      setFallbackOrder(fallbacks);

      setClaudeModel(data.claudeModel);
      setGeminiModel(data.geminiModel);
      setOpenaiModel(data.openaiModel);

      setClaudeApiKey(data.claudeApiKey || '');
      setGeminiApiKey(data.geminiApiKey || '');
      setOpenaiApiKey(data.openaiApiKey || '');

      setInitialLoaded(true);
    } catch (err: any) {
      console.error('Erro ao carregar configurações de IA:', err);
      setFetchError(err.message || 'Falha ao buscar dados do servidor.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError('');

    try {
      const payload = {
        primaryProvider,
        fallbackOrder: fallbackOrder.join(','),
        claudeModel,
        geminiModel,
        openaiModel,
        claudeApiKey,
        geminiApiKey,
        openaiApiKey,
      };

      await fetchAPI('/ai-config', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      loadConfig(); // Reload to refresh masked keys
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setSaveError(err.message || 'Falha ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const moveFallback = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...fallbackOrder];
    if (direction === 'up' && index > 0) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[index - 1];
      newOrder[index - 1] = temp;
    } else if (direction === 'down' && index < newOrder.length - 1) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[index + 1];
      newOrder[index + 1] = temp;
    }
    setFallbackOrder(newOrder);
  };

  // Automatically update fallbacks list when primary is changed
  useEffect(() => {
    if (!initialLoaded) return;
    const providers: ('CLAUDE' | 'GEMINI' | 'OPENAI')[] = ['CLAUDE', 'GEMINI', 'OPENAI'];
    const remaining = providers.filter((p) => p !== primaryProvider);
    // Keep existing order in remaining if possible
    const sortedRemaining = [...fallbackOrder].filter((p) => p !== primaryProvider);
    // Add missing ones
    remaining.forEach((r) => {
      if (!sortedRemaining.includes(r)) {
        sortedRemaining.push(r);
      }
    });
    setFallbackOrder(sortedRemaining);
  }, [primaryProvider, initialLoaded]);

  if (loading || !user || !initialLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  const isConfigured = (key: string) => {
    return key && key.length > 0;
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-x-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20">
            C
          </div>
          <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-indigo-200 to-slate-200 bg-clip-text text-transparent">
            CRM de Conversão
          </span>
        </div>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-900 transition cursor-pointer text-slate-300"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push('/pipeline')}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-900 transition cursor-pointer text-slate-300"
          >
            Funil (Kanban)
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            Configurações IA
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <button
            onClick={logout}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium hover:bg-slate-800/80 transition cursor-pointer"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main Settings Panel */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6 z-10 relative">
        {/* Navigation back link */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => router.push('/pipeline')}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar ao Kanban
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" /> Motor de Inteligência Artificial
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure o roteamento global das LLMs da sua agência. O sistema tentará usar o provedor primário e ativará fallbacks automaticamente em caso de erro.
          </p>
        </div>

        {fetchError && (
          <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 rounded-xl text-sm">
            {fetchError}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* CARD 1: Seleção de Provedores */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders className="h-5 w-5 text-indigo-400" />
              <h2 className="text-md font-bold text-white">Hierarquia de Execução e Modelos</h2>
            </div>

            {/* Provedor Primário */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-300 block">Provedor Primário (Primeira Escolha)</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CLAUDE */}
                <div 
                  onClick={() => setPrimaryProvider('CLAUDE')}
                  className={`relative cursor-pointer p-5 rounded-xl border transition flex flex-col gap-2 ${
                    primaryProvider === 'CLAUDE' 
                      ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/5' 
                      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">Anthropic Claude</span>
                    {isConfigured(claudeApiKey) ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50"></span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-amber-500 shadow-md shadow-amber-500/50"></span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">Excelente em análises semânticas complexas e resumos de contexto longo.</span>
                </div>

                {/* GEMINI */}
                <div 
                  onClick={() => setPrimaryProvider('GEMINI')}
                  className={`relative cursor-pointer p-5 rounded-xl border transition flex flex-col gap-2 ${
                    primaryProvider === 'GEMINI' 
                      ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/5' 
                      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">Google Gemini</span>
                    {isConfigured(geminiApiKey) ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50"></span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-amber-500 shadow-md shadow-amber-500/50"></span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">Altíssima velocidade, ideal para interações em tempo real e fallback instantâneo.</span>
                </div>

                {/* OPENAI */}
                <div 
                  onClick={() => setPrimaryProvider('OPENAI')}
                  className={`relative cursor-pointer p-5 rounded-xl border transition flex flex-col gap-2 ${
                    primaryProvider === 'OPENAI' 
                      ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/5' 
                      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">OpenAI GPT</span>
                    {isConfigured(openaiApiKey) ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50"></span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-amber-500 shadow-md shadow-amber-500/50"></span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">Estruturação JSON consistente. Inclui transcrição de áudios via Whisper.</span>
                </div>
              </div>
            </div>

            {/* Fallbacks Ordenados */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-300 block">Ordem de Fallback (Em caso de falha)</label>
              <div className="space-y-2 bg-slate-950/60 border border-slate-900 p-4 rounded-xl">
                {fallbackOrder.map((provider, index) => (
                  <div 
                    key={provider} 
                    className="flex items-center justify-between p-3 bg-slate-900/80 border border-slate-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold bg-slate-800 text-slate-300 h-5 w-5 flex items-center justify-center rounded-full">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-200">
                        {provider === 'CLAUDE' && 'Anthropic Claude'}
                        {provider === 'GEMINI' && 'Google Gemini'}
                        {provider === 'OPENAI' && 'OpenAI GPT'}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => moveFallback(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFallback(index, 'down')}
                        disabled={index === fallbackOrder.length - 1}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {fallbackOrder.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">Nenhum fallback configurado. Em caso de erro, a requisição falhará.</p>
                )}
              </div>
            </div>

            {/* Modelos de Cada Provedor */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-300 block">Especificação dos Modelos</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Modelo Claude</label>
                  <select 
                    value={claudeModel} 
                    onChange={(e) => setClaudeModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Recomendado)</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Modelo Gemini</label>
                  <select 
                    value={geminiModel} 
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recomendado)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Modelo OpenAI</label>
                  <select 
                    value={openaiModel} 
                    onChange={(e) => setOpenaiModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="gpt-4o-mini">GPT-4o Mini (Recomendado)</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: API Keys */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <CheckCircle2 className="h-5 w-5 text-indigo-400" />
              <h2 className="text-md font-bold text-white">Credenciais e Chaves de API</h2>
            </div>

            <div className="space-y-4">
              {/* Claude Key */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm text-slate-300 font-medium">Anthropic API Key</label>
                  {isConfigured(claudeApiKey) ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Configurada</span>
                  ) : (
                    <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Ausente (Usando .env)</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showClaudeKey ? 'text' : 'password'}
                    value={claudeApiKey}
                    onChange={(e) => setClaudeApiKey(e.target.value)}
                    placeholder="Digite a chave da Anthropic..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-3 pr-10 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showClaudeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Gemini Key */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm text-slate-300 font-medium">Gemini API Key</label>
                  {isConfigured(geminiApiKey) ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Configurada</span>
                  ) : (
                    <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Ausente (Usando .env)</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Digite a chave do Google Gemini..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-3 pr-10 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* OpenAI Key */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm text-slate-300 font-medium">OpenAI API Key</label>
                  {isConfigured(openaiApiKey) ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Configurada</span>
                  ) : (
                    <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Ausente (Usando .env)</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="Digite a chave da OpenAI..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-3 pr-10 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between">
            <div>
              {saveSuccess && (
                <span className="text-sm text-emerald-400 font-medium flex items-center gap-1.5 animate-bounce">
                  <CheckCircle2 className="h-4 w-4" /> Configurações salvas com sucesso!
                </span>
              )}
              {saveError && (
                <span className="text-sm text-red-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> {saveError}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-3 rounded-lg text-sm font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Salvar Configurações
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

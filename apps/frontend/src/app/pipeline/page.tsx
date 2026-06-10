'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { 
  DndContext, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  KeyboardSensor, 
  DragEndEvent, 
  DragStartEvent, 
  DragOverlay,
  useDroppable,
  useDraggable
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { 
  Plus, 
  User, 
  DollarSign, 
  Phone, 
  Mail, 
  Tag, 
  ChevronRight, 
  X, 
  MessageSquare, 
  Clock, 
  Send, 
  TrendingUp, 
  Sparkles,
  ArrowRight,
  Trash2
} from 'lucide-react';

interface Stage {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stageId: string;
  dealValue: number;
  sourceCampaign: string | null;
  tags: { id: string; tagName: string }[];
  updatedAt: string;
  engagement?: { id: string; score: number; trend: string }[];
  aiActions?: { id: string; status: string; reason: string; toStageId: string }[];
}

interface TimelineItem {
  id: string;
  type: string;
  description: string;
  actor: string;
  createdAt: string;
}

export default function PipelinePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);
  
  // Modals / Drawers State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  
  // Form States
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadValue, setNewLeadValue] = useState('');
  const [newLeadCampaign, setNewLeadCampaign] = useState('');
  const [newLeadTags, setNewLeadTags] = useState('');
  const [newNote, setNewNote] = useState('');

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [aiLogs, setAiLogs] = useState<any[]>([]);
  const [aiActions, setAiActions] = useState<any[]>([]);
  const [isResolvingAiAction, setIsResolvingAiAction] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  // Sensors for Drag and Drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Fetch initial stages and leads
  useEffect(() => {
    if (user) {
      fetchPipelineData();
    }
  }, [user]);

  const fetchPipelineData = async () => {
    try {
      const pipeline = await fetchAPI('/pipelines/default');
      setStages(pipeline.stages);
      
      const leadsList = await fetchAPI('/leads');
      setLeads(leadsList);
    } catch (err) {
      console.error('Erro ao buscar dados do pipeline:', err);
    }
  };

  // Fetch single lead details
  const fetchLeadDetails = async (leadId: string) => {
    try {
      const leadData = await fetchAPI(`/leads/${leadId}`);
      setSelectedLead(leadData);
      setChatMessages(leadData.conversations?.[0]?.messages || []);

      const aiData = await fetchAPI(`/leads/${leadId}/ai-logs`);
      setAiLogs(aiData.logs || []);
      setAiActions(aiData.actions || []);
    } catch (err) {
      console.error('Erro ao buscar detalhes do lead:', err);
    }
  };

  useEffect(() => {
    if (selectedLeadId) {
      fetchLeadDetails(selectedLeadId);
    } else {
      setSelectedLead(null);
    }
  }, [selectedLeadId]);

  // SSE connection for real-time messages
  useEffect(() => {
    if (!selectedLeadId) {
      setChatMessages([]);
      return;
    }

    const token = localStorage.getItem('crm_token');
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const eventSource = new EventSource(`${apiBaseUrl}/leads/${selectedLeadId}/stream?token=${token}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'AI_ANALYSIS') {
          console.log('[SSE] Recebida atualização de análise da IA:', data);
          setAiLogs((prev) => {
            if (prev.some((l) => l.id === data.analysisLog.id)) return prev;
            return [data.analysisLog, ...prev];
          });
          
          if (data.action) {
            setAiActions((prev) => {
              if (prev.some((a) => a.id === data.action.id)) {
                return prev.map((a) => a.id === data.action.id ? data.action : a);
              }
              return [data.action, ...prev];
            });
          }

          setSelectedLead((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              engagement: data.engagement ? [data.engagement] : prev.engagement
            };
          });

          setLeads((prevLeads) => {
            return prevLeads.map((l) => {
              if (l.id === selectedLeadId) {
                return {
                  ...l,
                  engagement: data.engagement ? [data.engagement] : l.engagement,
                  aiActions: data.action ? [data.action] : l.aiActions
                };
              }
              return l;
            });
          });
        } else {
          const newMsg = data;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id || (m.waMessageId && m.waMessageId === newMsg.waMessageId))) {
              return prev;
            }
            return [...prev, newMsg];
          });
        }
      } catch (err) {
        console.error('Erro ao processar mensagem SSE:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Erro na conexão EventSource:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedLeadId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !messageInput.trim() || isSending) return;

    setIsSending(true);
    try {
      const msg = await fetchAPI(`/leads/${selectedLeadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: messageInput }),
      });
      setChatMessages((prev) => [...prev, msg]);
      setMessageInput('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const lead = leads.find((l) => l.id === active.id);
    if (lead) {
      setActiveDragLead(lead);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragLead(null);

    if (!over) return;

    const leadId = active.id as string;
    const targetStageId = over.id as string;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === targetStageId) return;

    // Optimistic Update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: targetStageId } : l))
    );

    try {
      await fetchAPI(`/leads/${leadId}/move`, {
        method: 'PUT',
        body: JSON.stringify({ stageId: targetStageId }),
      });
      // Refetch to sync timestamps and timeline
      fetchPipelineData();
    } catch (err) {
      console.error('Erro ao mover lead:', err);
      // Rollback
      fetchPipelineData();
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName || !newLeadPhone || stages.length === 0) return;

    const firstStageId = stages[0].id;

    try {
      const parsedTags = newLeadTags
        ? newLeadTags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      await fetchAPI('/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: newLeadName,
          phone: newLeadPhone,
          email: newLeadEmail || undefined,
          stageId: firstStageId,
          dealValue: newLeadValue ? Number(newLeadValue) : 0,
          sourceCampaign: newLeadCampaign || undefined,
          tags: parsedTags,
        }),
      });

      // Reset Form
      setNewLeadName('');
      setNewLeadPhone('');
      setNewLeadEmail('');
      setNewLeadValue('');
      setNewLeadCampaign('');
      setNewLeadTags('');
      setIsCreateModalOpen(false);

      fetchPipelineData();
    } catch (err) {
      console.error('Erro ao criar lead:', err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !newNote.trim()) return;

    try {
      await fetchAPI(`/leads/${selectedLeadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote }),
      });
      setNewNote('');
      fetchLeadDetails(selectedLeadId);
    } catch (err) {
      console.error('Erro ao salvar nota:', err);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Deseja realmente remover este lead?')) return;

    try {
      await fetchAPI(`/leads/${leadId}`, {
        method: 'DELETE',
      });
      setSelectedLeadId(null);
      fetchPipelineData();
    } catch (err) {
      console.error('Erro ao deletar lead:', err);
    }
  };

  const handleResolveAiAction = async (actionId: string, status: 'ACCEPTED' | 'REVERTED') => {
    if (!selectedLeadId) return;
    setIsResolvingAiAction(true);
    try {
      await fetchAPI(`/leads/${selectedLeadId}/ai-actions/${actionId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await fetchLeadDetails(selectedLeadId);
      await fetchPipelineData();
    } catch (err) {
      console.error('Erro ao resolver ação da IA:', err);
    } finally {
      setIsResolvingAiAction(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

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
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-900 transition cursor-pointer text-slate-350"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push('/pipeline')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            Funil (Kanban)
          </button>
          {user?.role === 'OWNER' && (
            <button
              onClick={() => router.push('/settings')}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-900 transition cursor-pointer text-slate-300"
            >
              Configurações IA
            </button>
          )}
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

      {/* Main Kanban Content */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Funil de Vendas</h1>
            <p className="text-sm text-slate-400">Arraste e solte leads para atualizar o status no pipeline</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/10"
          >
            <Plus className="h-4 w-4" /> Novo Lead
          </button>
        </div>

        {/* Board Container */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4 select-none min-h-[500px]">
            {stages.map((stage) => {
              const stageLeads = leads.filter((l) => l.stageId === stage.id);
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={stageLeads}
                  onSelectLead={setSelectedLeadId}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeDragLead ? (
              <LeadCard
                lead={activeDragLead}
                onSelect={() => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Create Lead Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Cadastrar Novo Lead</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    placeholder="João Silva"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    WhatsApp (DDD + Número) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    placeholder="5511999998888"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  E-mail (Opcional)
                </label>
                <input
                  type="email"
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="joao@gmail.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Valor do Negócio (R$)
                  </label>
                  <input
                    type="number"
                    value={newLeadValue}
                    onChange={(e) => setNewLeadValue(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    placeholder="1500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Campanha de Origem
                  </label>
                  <input
                    type="text"
                    value={newLeadCampaign}
                    onChange={(e) => setNewLeadCampaign(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    placeholder="Meta Ads - Estética"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Tags (Separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={newLeadTags}
                  onChange={(e) => setNewLeadTags(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="interessado, urgência-alta"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 py-3 rounded-lg text-sm font-semibold text-white hover:from-indigo-500 hover:to-purple-500 transition cursor-pointer"
              >
                Cadastrar Lead
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lead Details Drawer */}
      {selectedLeadId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-slide-in">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur-md">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">{selectedLead?.name || 'Carregando...'}</h2>
                  {selectedLead?.stage && (
                    <span 
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: `${selectedLead.stage.color}15`, color: selectedLead.stage.color }}
                    >
                      {selectedLead.stage.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-1">Ficha de Detalhes do Lead</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDeleteLead(selectedLeadId)}
                  className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition cursor-pointer"
                  title="Excluir Lead"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setSelectedLeadId(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body Grid */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Lead Info + Notes & Timeline */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Basic info card */}
                <div className="bg-slate-950/60 border border-slate-850 p-5 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-900 pb-2">Informações Cadastrais</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="h-4 w-4" />
                      <span className="text-slate-200 font-mono">{selectedLead?.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Mail className="h-4 w-4" />
                      <span className="text-slate-200 truncate">{selectedLead?.email || 'Sem e-mail'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-slate-200">R$ {selectedLead?.dealValue?.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-slate-200">{selectedLead?.sourceCampaign || 'Origem não informada'}</span>
                    </div>
                  </div>

                  {selectedLead?.tags && selectedLead.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedLead.tags.map((tag: any) => (
                        <span key={tag.id} className="flex items-center gap-1 bg-slate-900 text-indigo-400 text-xs px-2.5 py-1 rounded-md border border-indigo-500/10">
                          <Tag className="h-3 w-3" /> {tag.tagName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* WhatsApp Chat Simulator */}
                <div className="bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col h-[320px] overflow-hidden">
                  <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs font-semibold text-slate-300">WhatsApp Chat</span>
                    </div>
                  </div>

                  {/* Messages list */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col">
                    {chatMessages.length === 0 ? (
                      <div className="text-center text-xs text-slate-500 my-auto">
                        Sem mensagens nesta conversa. Envie uma mensagem abaixo para iniciar.
                      </div>
                    ) : (
                      chatMessages.map((msg: any) => {
                        const isMe = msg.direction === 'OUTBOUND';
                        const timeString = new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        if (msg.type === 'AUDIO') {
                          return (
                            <div
                              key={msg.id}
                              className={`self-start bg-slate-900/90 text-slate-200 text-sm px-3.5 py-2 rounded-xl max-w-[80%] rounded-tl-none font-medium`}
                            >
                              🔊 Áudio {msg.transcription ? `- Transcrito por Whisper:` : ''}
                              {msg.transcription ? (
                                <p className="italic font-normal text-slate-300 mt-1">"{msg.transcription.transcriptText}"</p>
                              ) : (
                                <p className="italic font-normal text-slate-400 mt-1">[Arquivo de áudio - ID: {msg.content}]</p>
                              )}
                              <span className="block text-[10px] text-slate-400 text-right mt-1">{timeString}</span>
                            </div>
                          );
                        }

                        if (msg.type === 'IMAGE') {
                          return (
                            <div
                              key={msg.id}
                              className={`self-start bg-slate-900/90 text-slate-200 text-sm px-3.5 py-2 rounded-xl max-w-[80%] rounded-tl-none`}
                            >
                              🖼️ Imagem [ID: {msg.content}]
                              <span className="block text-[10px] text-slate-400 text-right mt-1">{timeString}</span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            className={`max-w-[80%] text-sm px-3.5 py-2 rounded-xl ${
                              isMe
                                ? 'self-end bg-indigo-600/90 text-white rounded-tr-none'
                                : 'self-start bg-slate-900/90 text-slate-200 rounded-tl-none'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <span
                              className={`block text-[10px] text-right mt-1 ${
                                isMe ? 'text-indigo-300' : 'text-slate-400'
                              }`}
                            >
                              {timeString}
                            </span>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input sending bar */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-900 bg-slate-950/60 flex gap-2">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Digite sua mensagem para o WhatsApp..."
                      disabled={isSending}
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isSending || !messageInput.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg disabled:bg-indigo-600/30 disabled:text-indigo-400 transition cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>

                {/* Timeline and notes */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Histórico de Atividades</h3>
                  
                  {/* Note creation form */}
                  <form onSubmit={handleAddNote} className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Adicionar nota ou observação..."
                      className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer"
                    >
                      Salvar
                    </button>
                  </form>

                  {/* Timeline list */}
                  <div className="space-y-3">
                    {selectedLead?.timeline?.map((item: TimelineItem) => (
                      <div key={item.id} className="flex items-start gap-3 bg-slate-950/40 p-4 border border-slate-900 rounded-lg text-sm">
                        <div className="mt-0.5">
                          {item.type === 'STAGE_CHANGE' ? (
                            <ArrowRight className="h-4 w-4 text-indigo-400" />
                          ) : item.type === 'CAPI_FIRED' ? (
                            <Sparkles className="h-4 w-4 text-purple-400" />
                          ) : (
                            <Clock className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-200 font-medium">{item.description}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                            <span>{item.actor === 'AI' ? '🧠 IA' : item.actor === 'SYSTEM' ? '⚙️ Sistema' : '👤 Usuário'}</span>
                            <span>•</span>
                            <span>{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column: AI Insights Panel */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/10 p-5 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                    <h3 className="font-bold text-white text-sm">Painel de Insights IA</h3>
                  </div>

                  {/* Score de Engajamento */}
                  {selectedLead.engagement && selectedLead.engagement.length > 0 ? (
                    (() => {
                      const latestEng = selectedLead.engagement[0];
                      const score = latestEng.score;
                      const badge = score >= 70 ? '🔥 Leads Quente' : score >= 40 ? '⚡ Leads Morno' : '❄️ Leads Frio';
                      const badgeColor = score >= 70 
                        ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                        : score >= 40 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                          : 'bg-blue-500/10 text-blue-450 border-blue-550/20';

                      const trendArrow = latestEng.trend === 'RISING' ? '📈' : latestEng.trend === 'FALLING' ? '📉' : '➡️';

                      return (
                        <div className="text-center bg-slate-950/60 p-4 border border-slate-900 rounded-lg space-y-1">
                          <span className="text-xs text-slate-400 uppercase tracking-wider block">Score de Engajamento</span>
                          <span className="text-3xl font-extrabold text-white block">
                            {score} <span className="text-lg">{trendArrow}</span>
                          </span>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                            {badge}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center bg-slate-950/60 p-4 border border-slate-900 rounded-lg text-xs text-slate-400">
                      Aguardando processamento do motor de IA...
                    </div>
                  )}

                  {/* Intenções Detectadas */}
                  {(() => {
                    const latestLog = aiLogs[0];
                    let detectedIntents: string[] = [];
                    if (latestLog) {
                      try {
                        const parsed = JSON.parse(latestLog.parsedJson);
                        detectedIntents = parsed.intentTags || [];
                      } catch (e) {}
                    }

                    if (detectedIntents.length === 0) return null;

                    return (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Intenções Detectadas</span>
                        <div className="flex flex-wrap gap-1.5">
                          {detectedIntents.map((tag) => (
                            <span 
                              key={tag} 
                              className="px-2.5 py-1 text-[10px] font-medium bg-slate-950 border border-slate-800 text-slate-300 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Ações sugeridas da IA */}
                  {(() => {
                    const pendingActions = aiActions.filter((a) => a.status === 'PENDING');
                    if (pendingActions.length === 0) return null;

                    return (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Ações Recomendadas</span>
                        <div className="space-y-2">
                          {pendingActions.map((action) => {
                            const targetStage = stages.find((s) => s.id === action.toStageId);
                            return (
                              <div key={action.id} className="bg-slate-950/80 p-3.5 border border-purple-500/20 rounded-lg text-xs space-y-2">
                                <p className="text-purple-400 font-semibold flex items-center gap-1">
                                  <Sparkles className="h-3 w-3 animate-pulse" /> Sugestão de Movimentação
                                </p>
                                <p className="text-slate-300 mt-1">
                                  Mover para <span className="text-white font-bold font-mono">"{targetStage?.name || 'Estágio Recomendado'}"</span>
                                </p>
                                <p className="text-slate-400 italic">"Motivo: {action.reason}"</p>
                                <p className="text-[10px] text-slate-500 font-mono">Evidência: "{action.triggerEvidence}"</p>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleResolveAiAction(action.id, 'ACCEPTED')}
                                    disabled={isResolvingAiAction}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1 px-2 rounded transition"
                                  >
                                    Aceitar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolveAiAction(action.id, 'REVERTED')}
                                    disabled={isResolvingAiAction}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1 px-2 rounded transition"
                                  >
                                    Rejeitar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Última análise log */}
                  {aiLogs.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Metadados de Execução</span>
                      <div className="bg-slate-950/85 p-3.5 border border-slate-900 rounded-lg text-xs space-y-1.5 font-sans">
                        <p className="text-slate-300">
                          {(() => {
                            try {
                              const parsed = JSON.parse(aiLogs[0].parsedJson);
                              return parsed.actionReason || 'Última análise concluída com sucesso.';
                            } catch (e) {
                              return 'Última análise concluída com sucesso.';
                            }
                          })()}
                        </p>
                        <div className="border-t border-slate-900/80 mt-2 pt-1.5 flex flex-col gap-0.5 text-[10px] text-slate-500 font-mono">
                          <span>Modelo: {aiLogs[0].modelUsed || 'Claude 3.5 Sonnet'}</span>
                          <span>Análise: {new Date(aiLogs[0].createdAt).toLocaleTimeString('pt-BR')} • {new Date(aiLogs[0].createdAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({ 
  stage, 
  leads, 
  onSelectLead 
}: { 
  stage: Stage; 
  leads: Lead[]; 
  onSelectLead: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={`flex-shrink-0 w-80 rounded-2xl flex flex-col h-full bg-slate-900/30 border transition ${
        isOver ? 'border-indigo-500 bg-slate-900/50' : 'border-slate-900 bg-slate-900/10'
      }`}
    >
      {/* Column Header */}
      <div className="p-4 border-b border-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span 
            className="h-2.5 w-2.5 rounded-full" 
            style={{ backgroundColor: stage.color }}
          />
          <span className="font-semibold text-sm text-slate-200">{stage.name}</span>
        </div>
        <span className="text-xs text-slate-500 bg-slate-950 px-2 py-0.5 rounded-md font-mono">
          {leads.length}
        </span>
      </div>

      {/* Cards List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 max-h-[calc(100vh-220px)]">
        {leads.map((lead) => (
          <DraggableLeadCard 
            key={lead.id} 
            lead={lead} 
            onSelect={onSelectLead} 
          />
        ))}
      </div>
    </div>
  );
}

// Draggable Lead Card Wrapper
function DraggableLeadCard({ lead, onSelect }: { lead: Lead; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={isDragging ? 'opacity-30' : ''}
    >
      <LeadCard lead={lead} onSelect={onSelect} />
    </div>
  );
}

// Visual Lead Card
function LeadCard({ 
  lead, 
  onSelect,
  isOverlay = false 
}: { 
  lead: Lead; 
  onSelect: (id: string) => void;
  isOverlay?: boolean;
}) {
  const score = lead.engagement?.[0]?.score;
  const badge = score !== undefined 
    ? (score >= 70 ? '🔥' : score >= 40 ? '⚡' : '❄️') 
    : null;

  const hasPendingAction = lead.aiActions && lead.aiActions.length > 0;

  return (
    <div
      onClick={() => onSelect(lead.id)}
      className={`bg-slate-950/80 border hover:border-indigo-500/40 p-4 rounded-xl space-y-3 cursor-grab active:cursor-grabbing transition shadow-md ${
        isOverlay ? 'border-indigo-500 bg-slate-950 shadow-indigo-600/10' : 'border-slate-850'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-sm text-slate-100 line-clamp-1">{lead.name}</h4>
        <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
      </div>

      <div className="space-y-1.5 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="font-mono">{lead.phone}</span>
        </div>
        {lead.dealValue > 0 && (
          <div className="flex items-center gap-1.5 text-indigo-400 font-medium">
            <DollarSign className="h-3.5 w-3.5 shrink-0" />
            <span>R$ {lead.dealValue.toLocaleString('pt-BR')}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px] text-slate-500">
        <span className="truncate max-w-[120px]">{lead.sourceCampaign || 'Direto'}</span>
        <div className="flex items-center gap-1.5">
          {score !== undefined && (
            <span className="flex items-center gap-0.5 text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-mono font-medium shrink-0">
              {badge} {score}
            </span>
          )}
          {hasPendingAction ? (
            <span className="flex items-center gap-0.5 text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold shrink-0 animate-pulse">
              <Sparkles className="h-2.5 w-2.5" /> Ação IA
            </span>
          ) : (
            lead.id && (
              <span className="flex items-center gap-0.5 text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium shrink-0">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

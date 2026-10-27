import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Send,
  Paperclip,
  Zap,
  Lock,
  UserCheck,
  ArrowRightLeft,
  Bot,
  Hand,
  Check,
  CheckCheck,
  AlertTriangle,
  PanelRightOpen,
  PanelRightClose,
  Sparkles,
  Users,
  MessageCircle,
  StickyNote,
  FlaskConical,
} from 'lucide-react';
import { cn, formatTime, getInitials } from '../lib/utils';
import ContactDrawer from './ContactDrawer';

export default function OmnichannelInbox({
  contacts = [],
  selectedContactId,
  onSelectContact,
  contactDetail,
  sellers = [],
  activeSeller,
  stages = [],
  quickReplies = [],
  windowInfo,
  onSendMessage,
  onSendTemplate,
  onSendSimulated,
  onAssignContact,
  onChangeTemperature,
  onAddTag,
  onMoveStage,
  onOpenSellersModal,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, mine, waiting, others, bot
  const [channelFilter, setChannelFilter] = useState(''); // '', whatsapp, instagram
  const [chatSubTab, setChatSubTab] = useState('attendance'); // attendance, notes, simulator
  const [messageText, setMessageText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const feedEndRef = useRef(null);

  const currentContact = contactDetail?.contact || null;
  const messages = contactDetail?.messages || [];
  const deal = contactDetail?.deal || null;
  const stage = contactDetail?.stage || null;

  const activeSellerName = activeSeller?.name || 'Lucas Silva';

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedContactId, chatSubTab]);

  // Regras de posse e bloqueio entre vendedores
  const isAssignedHuman =
    currentContact &&
    (currentContact.attendance_status === 'human' ||
      currentContact.ai_enabled === false) &&
    currentContact.assignee &&
    ![
      'Agente IA',
      'Fila de Espera Humana',
      'Fila de Espera',
      'Fila',
      '',
    ].includes(currentContact.assignee);

  const isMine =
    isAssignedHuman &&
    (currentContact.seller_id === activeSeller?.id ||
      currentContact.assignee?.toLowerCase() ===
        activeSellerName.toLowerCase());

  const isLockedForMe = isAssignedHuman && !isMine;

  // Contadores de filtros
  const countMine = contacts.filter(
    (c) =>
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      (c.seller_id === activeSeller?.id || c.assignee === activeSellerName)
  ).length;

  const countWaiting = contacts.filter(
    (c) =>
      c.attendance_status === 'waiting' ||
      c.assignee === 'Fila de Espera Humana'
  ).length;

  const countOthers = contacts.filter(
    (c) =>
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      c.assignee &&
      c.assignee !== activeSellerName &&
      c.assignee !== 'Agente IA' &&
      c.assignee !== 'Fila de Espera Humana'
  ).length;

  // Filtragem de contatos
  const filteredContacts = contacts.filter((c) => {
    if (channelFilter && c.channel !== channelFilter) return false;

    const cIsMine =
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      (c.seller_id === activeSeller?.id || c.assignee === activeSellerName);
    const cIsWaiting =
      c.attendance_status === 'waiting' ||
      c.assignee === 'Fila de Espera Humana';
    const cIsOthers =
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      c.assignee &&
      !cIsMine &&
      c.assignee !== 'Agente IA' &&
      c.assignee !== 'Fila de Espera Humana';
    const cIsBot =
      (c.attendance_status === 'bot' || !c.attendance_status) &&
      c.ai_enabled !== false;

    if (statusFilter === 'mine' && !cIsMine) return false;
    if (statusFilter === 'waiting' && !cIsWaiting) return false;
    if (statusFilter === 'others' && !cIsOthers) return false;
    if (statusFilter === 'bot' && !cIsBot) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchPhone = (c.phone || '').toLowerCase().includes(q);
      const matchAssignee = (c.assignee || '').toLowerCase().includes(q);
      const matchTag = (c.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchPhone && !matchAssignee && !matchTag) return false;
    }

    return true;
  });

  // Separação de mensagens externas vs notas internas
  const displayedMessages = messages.filter((m) => {
    if (chatSubTab === 'notes') {
      return m.is_internal || m.sender === 'internal';
    }
    return !m.is_internal && m.sender !== 'internal';
  });

  const handleSendSubmit = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentContact) return;

    const text = messageText;
    setMessageText('');

    if (chatSubTab === 'simulator') {
      await onSendSimulated({
        contact_id: currentContact.id,
        content: text,
        channel: currentContact.channel,
      });
    } else if (chatSubTab === 'notes') {
      await onSendMessage({
        contact_id: currentContact.id,
        content: `🔒 [Nota de ${activeSellerName}]: ${text}`,
        sender: 'internal',
        sender_name: activeSellerName,
        is_internal: true,
      });
    } else {
      await onSendMessage({
        contact_id: currentContact.id,
        content: text,
        sender: 'human',
        sender_name: activeSellerName,
        is_internal: false,
      });
    }
  };

  const handleConfirmTransfer = async (e) => {
    e.preventDefault();
    if (!transferTargetId || !currentContact) return;
    const targetSeller = sellers.find((s) => s.id === transferTargetId);
    if (!targetSeller) return;

    await onAssignContact(currentContact.id, {
      assignee: targetSeller.name,
      seller_id: targetSeller.id,
      ai_enabled: false,
      attendance_status: 'human',
      operator_name: activeSellerName,
      transfer_reason: transferReason,
    });
    setShowTransferModal(false);
    setTransferReason('');
  };

  return (
    <div className="flex-1 flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* =================================================================== */}
      {/* COLUNA 1: PAINEL DE CONVERSAS (FILA OMNICHANNEL)                     */}
      {/* =================================================================== */}
      <div className="w-80 md:w-96 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
        {/* Topo da Lista */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                Conversas & Fila
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                WhatsApp Oficial & Instagram Direct
              </p>
            </div>
            <button
              onClick={onOpenSellersModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold hover:bg-emerald-100 transition"
              title="Gerenciar equipe de vendedores"
            >
              <Users size={13} />
              <span>+ Equipe</span>
            </button>
          </div>

          {/* Busca Rápida */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-2.5 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, telefone, vendedor ou #tag..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* Filtros de Status / Posse */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: `Todos (${contacts.length})` },
              { id: 'mine', label: `Meus (${countMine})` },
              { id: 'waiting', label: `Fila (${countWaiting})` },
              { id: 'others', label: `Colegas (${countOthers})` },
              { id: 'bot', label: 'Robô IA' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition',
                  statusFilter === tab.id
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro por Canal */}
          <div className="flex items-center gap-1 text-[11px]">
            {[
              { id: '', label: 'Todos Canais' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'instagram', label: 'Instagram' },
            ].map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChannelFilter(ch.id)}
                className={cn(
                  'flex-1 py-1 rounded-md font-semibold border transition',
                  channelFilter === ch.id
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhuma conversa encontrada para este filtro.
            </div>
          ) : (
            filteredContacts.map((c) => {
              const selected = c.id === selectedContactId;
              const cIsMine =
                (c.attendance_status === 'human' || c.ai_enabled === false) &&
                (c.seller_id === activeSeller?.id ||
                  c.assignee === activeSellerName);
              const cIsOther =
                (c.attendance_status === 'human' || c.ai_enabled === false) &&
                c.assignee &&
                !cIsMine &&
                c.assignee !== 'Agente IA' &&
                c.assignee !== 'Fila de Espera Humana';

              return (
                <button
                  key={c.id}
                  onClick={() => onSelectContact(c.id)}
                  className={cn(
                    'w-full p-3.5 text-left flex items-start gap-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    selected &&
                      'bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-l-emerald-700'
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {c.name}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatTime(c.updated_at)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {c.phone || c.email || 'Canal digital'}
                    </div>

                    {/* Badges de Posse do Vendedor e Canal */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {c.channel}
                      </span>
                      {cIsMine ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                          ✓ Seu ({c.assignee})
                        </span>
                      ) : cIsOther ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                          🔒 Com: {c.assignee}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          🤖 Agente IA
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* COLUNA 2: ÁREA CENTRAL DE CHAT OMNICHANNEL                          */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-50/50 dark:bg-slate-950">
        {!currentContact ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <MessageCircle
              size={42}
              className="text-slate-300 dark:text-slate-700 mb-3"
            />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300">
              Selecione uma conversa ao lado
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Assuma atendimentos em 1 clique, transfira para colegas da equipe
              ou acompanhe a qualificação automática da IA.
            </p>
          </div>
        ) : (
          <>
            {/* Cabeçalho do Chat */}
            <header className="h-16 px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {getInitials(currentContact.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {currentContact.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {currentContact.channel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {isMine
                      ? `🎧 Fixado com você (${currentContact.assignee})`
                      : isLockedForMe
                      ? `🔒 Em atendimento exclusivo por ${currentContact.assignee}`
                      : '🤖 Em atendimento automático pela IA'}
                  </p>
                </div>
              </div>

              {/* Botões de Posse e Gaveta */}
              <div className="flex items-center gap-2 shrink-0">
                {isMine ? (
                  <>
                    <button
                      onClick={() => {
                        const colleagues = sellers.filter(
                          (s) => s.id !== activeSeller?.id
                        );
                        setTransferTargetId(colleagues[0]?.id || '');
                        setShowTransferModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                    >
                      <ArrowRightLeft size={13} />
                      <span>Transferir</span>
                    </button>
                    <button
                      onClick={() =>
                        onAssignContact(currentContact.id, {
                          assignee: 'Agente IA',
                          seller_id: null,
                          ai_enabled: true,
                          attendance_status: 'bot',
                          operator_name: activeSellerName,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-xs font-semibold text-slate-600 dark:text-slate-300 transition"
                    >
                      <Bot size={14} />
                      <span>Devolver à IA</span>
                    </button>
                  </>
                ) : isLockedForMe ? (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Este cliente está com ${currentContact.assignee}. Deseja puxar/assumir o atendimento para você (${activeSellerName})?`
                        )
                      ) {
                        onAssignContact(currentContact.id, {
                          assignee: activeSellerName,
                          seller_id: activeSeller?.id,
                          ai_enabled: false,
                          attendance_status: 'human',
                          operator_name: activeSellerName,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    <Hand size={14} />
                    <span>Assumir de {currentContact.assignee}</span>
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      onAssignContact(currentContact.id, {
                        assignee: activeSellerName,
                        seller_id: activeSeller?.id,
                        ai_enabled: false,
                        attendance_status: 'human',
                        operator_name: activeSellerName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
                  >
                    <UserCheck size={14} />
                    <span>Pegar Conversa (Fixar Comigo)</span>
                  </button>
                )}

                <button
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  title={
                    drawerOpen
                      ? 'Ocultar gaveta de detalhes'
                      : 'Mostrar gaveta de detalhes'
                  }
                >
                  {drawerOpen ? (
                    <PanelRightClose size={16} />
                  ) : (
                    <PanelRightOpen size={16} />
                  )}
                </button>
              </div>
            </header>

            {/* Sub-Abas do Chat (Atendimento Oficial / Notas Internas / Simulador) */}
            <div className="px-5 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[
                  {
                    id: 'attendance',
                    label: 'Atendimento Oficial',
                    icon: MessageCircle,
                  },
                  {
                    id: 'notes',
                    label: 'Notas Internas (Equipe)',
                    icon: StickyNote,
                  },
                  {
                    id: 'simulator',
                    label: 'Simular Mensagem do Cliente',
                    icon: FlaskConical,
                  },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setChatSubTab(t.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition',
                        chatSubTab === t.id
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <Icon size={13} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Operador ativo: <strong className="text-slate-700 dark:text-slate-200">{activeSellerName}</strong>
              </span>
            </div>

            {/* Feed de Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {displayedMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  Nenhuma mensagem registrada nesta aba ainda.
                </div>
              ) : (
                displayedMessages.map((m) => {
                  const isCustomer = m.sender === 'contact';
                  const isSystem = m.sender === 'system';
                  const isInternal = m.is_internal || m.sender === 'internal';

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex flex-col max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs border',
                        isCustomer
                          ? 'mr-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                          : isSystem
                          ? 'mx-auto max-w-lg bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-center'
                          : isInternal
                          ? 'ml-auto bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                          : 'ml-auto bg-emerald-700 text-white border-emerald-800'
                      )}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1 opacity-80 text-[10px] font-semibold">
                        <span>
                          {isCustomer
                            ? currentContact.name
                            : isSystem
                            ? 'Sistema'
                            : isInternal
                            ? '🔒 Nota Interna da Equipe'
                            : m.sender === 'agent'
                            ? '🤖 Assistente IA'
                            : `👤 ${currentContact.assignee || activeSellerName}`}
                        </span>
                        <span className="flex items-center gap-1">
                          {formatTime(m.timestamp)}
                          {!isCustomer && !isSystem && (
                            <>
                              {m.delivery_status === 'read' ? (
                                <CheckCheck size={13} className="text-sky-300" />
                              ) : m.delivery_status === 'failed' ? (
                                <AlertTriangle
                                  size={13}
                                  className="text-rose-300"
                                />
                              ) : (
                                <Check size={13} />
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="whitespace-pre-line break-words">
                        {m.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Banner de Bloqueio Estrito quando outro vendedor é dono da conversa */}
            {isLockedForMe && chatSubTab === 'attendance' && (
              <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/60 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-amber-600 shrink-0" />
                  <span>
                    <strong>Chat Bloqueado:</strong> Este cliente está fixado
                    exclusivamente com <strong>{currentContact.assignee}</strong>
                    . Você não pode enviar mensagens externas a menos que assuma
                    o atendimento.
                  </span>
                </div>
                <button
                  onClick={() =>
                    onAssignContact(currentContact.id, {
                      assignee: activeSellerName,
                      seller_id: activeSeller?.id,
                      ai_enabled: false,
                      attendance_status: 'human',
                      operator_name: activeSellerName,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] shrink-0"
                >
                  Assumir Atendimento
                </button>
              </div>
            )}

            {/* Popup de Respostas Rápidas (/) */}
            {showQuickReplies && (
              <div className="mx-5 mb-2 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg max-h-48 overflow-y-auto space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span>⚡ Respostas Rápidas (Clique para usar)</span>
                  <button onClick={() => setShowQuickReplies(false)}>✕</button>
                </div>
                {quickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => {
                      setMessageText(qr.content);
                      setShowQuickReplies(false);
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mr-2">
                        {qr.shortcut}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {qr.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 truncate max-w-xs">
                      {qr.content}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Barra de Digitação */}
            <form
              onSubmit={handleSendSubmit}
              className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <button
                type="button"
                disabled={isLockedForMe && chatSubTab === 'attendance'}
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40"
                title="Respostas Rápidas (/)"
              >
                <Zap size={15} className="inline mr-1 text-emerald-600" />
                Atalhos
              </button>

              <button
                type="button"
                disabled={isLockedForMe && chatSubTab === 'attendance'}
                onClick={() => setShowTemplateModal(true)}
                className="px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-xs font-bold text-blue-800 dark:text-blue-300 hover:bg-blue-100 disabled:opacity-40"
                title="Disparar Template Oficial da Meta (HSM)"
              >
                <Sparkles size={14} className="inline mr-1" />
                Template HSM
              </button>

              <input
                type="text"
                disabled={isLockedForMe && chatSubTab === 'attendance'}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={
                  isLockedForMe && chatSubTab === 'attendance'
                    ? `Chat bloqueado — em atendimento por ${currentContact.assignee}`
                    : chatSubTab === 'notes'
                    ? 'Escrever nota interna visível apenas para a equipe...'
                    : chatSubTab === 'simulator'
                    ? 'Simular mensagem enviada pelo cliente no WhatsApp...'
                    : `Responder como ${activeSellerName}...`
                }
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={
                  !messageText.trim() ||
                  (isLockedForMe && chatSubTab === 'attendance')
                }
                className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-40 transition"
              >
                <Send size={14} />
                <span>Enviar</span>
              </button>
            </form>
          </>
        )}
      </div>

      {/* =================================================================== */}
      {/* COLUNA 3: GAVETA LATERAL DO CONTATO                                 */}
      {/* =================================================================== */}
      {drawerOpen && currentContact && (
        <ContactDrawer
          contact={currentContact}
          deal={deal}
          stage={stage}
          stages={stages}
          sellers={sellers}
          windowInfo={windowInfo}
          onAssignSeller={(payload) =>
            onAssignContact(currentContact.id, {
              ...payload,
              operator_name: activeSellerName,
            })
          }
          onChangeTemperature={(temp) =>
            onChangeTemperature(currentContact.id, temp)
          }
          onAddTag={(tag) => onAddTag(currentContact.id, tag)}
          onMoveStage={onMoveStage}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Modal de Transferência de Vendedor */}
      {showTransferModal && currentContact && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmTransfer}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Transferir Atendimento
            </h3>
            <p className="text-xs text-slate-500">
              Transferindo <strong>{currentContact.name}</strong> para outro
              vendedor da equipe:
            </p>
            <div>
              <label className="block text-xs font-bold mb-1">
                Selecionar Vendedor Destino
              </label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs font-semibold"
              >
                {sellers
                  .filter((s) => s.id !== activeSeller?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                Motivo / Observação Interna (Opcional)
              </label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ex: Cliente pediu orçamento de atacado..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
              >
                Confirmar Transferência
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Disparo de Templates HSM Oficiais da Meta */}
      {showTemplateModal && currentContact && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Templates Oficiais Meta (HSM)
              </h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {windowInfo?.reason ||
                'Selecione um template aprovado para iniciar ou reabrir a janela de 24h.'}
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(windowInfo?.templates || []).map((tpl) => (
                <div
                  key={tpl.name}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      {tpl.title}{' '}
                      <span className="font-mono text-[10px] text-blue-600">
                        ({tpl.name})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {tpl.preview}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await onSendTemplate({
                        contact_id: currentContact.id,
                        template_name: tpl.name,
                        language_code: tpl.language,
                        sender_name: activeSellerName,
                      });
                      setShowTemplateModal(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                  >
                    Disparar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

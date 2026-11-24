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
  Check,
  CheckCheck,
  AlertCircle,
  PanelRightOpen,
  PanelRightClose,
  Sparkles,
  Users,
  MessageCircle,
  StickyNote,
  FlaskConical,
  Eye,
  Crown,
  Mic,
  Square,
  Shuffle,
  FileText,
  Instagram,
  X,
  Inbox,
  CornerDownRight,
} from 'lucide-react';
import { cn, formatTime } from '../lib/utils';
import ContactDrawer from './ContactDrawer';
import {
  Avatar,
  Badge,
  Button,
  CountPill,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SectionLabel,
  Segmented,
  StatusDot,
  Tabs,
  fieldClass,
  textareaClass,
} from './ui';
import regenLogo from '../assets/logo.png';

export default function OmnichannelInbox({
  contacts = [],
  selectedContactId,
  onSelectContact,
  contactDetail,
  sellers = [],
  activeSeller,
  isSupervisorMode = true,
  impersonatedSeller = null,
  onImpersonateSeller,
  onExitImpersonation,
  stages = [],
  quickReplies = [],
  windowInfo,
  onSendMessage,
  onSendAudio,
  onSendTemplate,
  onSendSimulated,
  onReplyInstagramComment,
  onAssignContact,
  onRoundRobinAssign,
  onChangeTemperature,
  onAddTag,
  onMoveStage,
  onExportLgpd,
  onAnonymizeLgpd,
  onToggleConsent,
  onOpenSellersModal,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => (isSupervisorMode ? 'all' : 'mine'));
  const [channelFilter, setChannelFilter] = useState(''); // '', whatsapp, instagram
  const [supervisorSellerFilter, setSupervisorSellerFilter] = useState(''); // '', seller_id

  useEffect(() => {
    if (!isSupervisorMode && statusFilter !== 'mine' && statusFilter !== 'waiting') {
      setStatusFilter('mine');
    }
  }, [isSupervisorMode, statusFilter]);
  const [chatSubTab, setChatSubTab] = useState('attendance'); // attendance, notes, simulator
  const [messageText, setMessageText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [supervisorIntervention, setSupervisorIntervention] = useState(false);
  const [showIgCommentModal, setShowIgCommentModal] = useState(false);
  const [igPublicReply, setIgPublicReply] = useState(
    'Olá! Respondemos você no Direct com todos os detalhes.'
  );
  const [igPrivateDm, setIgPrivateDm] = useState(
    'Olá! Vi seu comentário na nossa publicação do Instagram. Como posso te ajudar hoje?'
  );
  const [igSending, setIgSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewImage, setPreviewImage] = useState(null);

  const feedEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const currentContact = contactDetail?.contact || null;
  const messages = contactDetail?.messages || [];
  const deal = contactDetail?.deal || null;
  const stage = contactDetail?.stage || null;

  const effectiveSeller = impersonatedSeller || activeSeller;
  const activeSellerName = effectiveSeller?.name || 'Supervisor';

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
    (currentContact.seller_id === effectiveSeller?.id ||
      currentContact.assignee?.toLowerCase() ===
        activeSellerName.toLowerCase());

  const isLockedForMe = isAssignedHuman && !isMine;
  const isInputBlocked =
    isLockedForMe &&
    chatSubTab === 'attendance' &&
    !(isSupervisorMode && supervisorIntervention);

  // Contadores de filtros
  const countMine = contacts.filter(
    (c) =>
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      (c.seller_id === effectiveSeller?.id || c.assignee === activeSellerName)
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
      (c.seller_id === effectiveSeller?.id ||
        (c.assignee || '').toLowerCase() === activeSellerName.toLowerCase());
    const cIsWaiting =
      c.attendance_status === 'waiting' ||
      c.assignee === 'Fila de Espera Humana' ||
      c.assignee === 'Fila de Espera';
    const cIsOthers =
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      Boolean(c.assignee) &&
      !cIsMine &&
      c.assignee !== 'Agente IA' &&
      c.assignee !== 'Fila de Espera Humana' &&
      c.assignee !== 'Fila de Espera';
    const cIsBot = !cIsMine && !cIsWaiting && !cIsOthers;

    // BLOQUEIO ESTRITO: Vendedor comum JAMAIS vê chats de colegas ou IA
    if (!isSupervisorMode) {
      if (statusFilter === 'waiting') {
        if (!cIsWaiting) return false;
      } else {
        if (!cIsMine) return false;
      }
    } else {
      if (supervisorSellerFilter) {
        const targetS = sellers.find((s) => s.id === supervisorSellerFilter);
        const matchSeller =
          c.seller_id === supervisorSellerFilter ||
          (targetS &&
            (c.assignee || '').toLowerCase() === targetS.name.toLowerCase());
        if (!matchSeller) return false;
      }

      if (statusFilter === 'mine' && !cIsMine) return false;
      if (statusFilter === 'waiting' && !cIsWaiting) return false;
      if (statusFilter === 'others' && !cIsOthers) return false;
      if (statusFilter === 'bot' && !cIsBot) return false;
    }

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

    const senderLabel = impersonatedSeller
      ? `${impersonatedSeller.name} (via Supervisor)`
      : isSupervisorMode && supervisorIntervention && isLockedForMe
      ? `Supervisor (${activeSellerName})`
      : activeSellerName;

    if (chatSubTab === 'simulator') {
      await onSendSimulated({
        contact_id: currentContact.id,
        content: text,
        channel: currentContact.channel,
      });
    } else if (chatSubTab === 'notes') {
      await onSendMessage({
        contact_id: currentContact.id,
        content: `[Nota de ${senderLabel}]: ${text}`,
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
        is_supervisor_override: Boolean(
          isSupervisorMode && (supervisorIntervention || impersonatedSeller)
        ),
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

  // Gravação de Áudio PTT
  const handleToggleAudioRecording = async () => {
    if (!currentContact || isInputBlocked) return;

    if (isRecordingAudio) {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecordingAudio(false);
      setRecordingSeconds(0);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Url = reader.result;
          if (onSendAudio && base64Url) {
            await onSendAudio({
              contact_id: currentContact.id,
              audio_base64: base64Url,
              sender_name: activeSellerName,
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(1);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      if (onSendMessage) {
        await onSendMessage({
          contact_id: currentContact.id,
          content: '[Nota de Voz (0:06)]',
          sender: 'human',
          sender_name: activeSellerName,
          media_type: 'audio',
          is_internal: false,
          is_supervisor_override: Boolean(
            isSupervisorMode && (supervisorIntervention || impersonatedSeller)
          ),
        });
      }
    }
  };

  const handleFileAttachmentChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentContact || isInputBlocked) return;
    e.target.value = '';

    const isImg = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      await onSendMessage({
        contact_id: currentContact.id,
        content: isImg
          ? `[Imagem: ${file.name}]`
          : `[Documento: ${file.name} (${Math.round(file.size / 1024)} KB)]`,
        sender: 'human',
        sender_name: activeSellerName,
        media_type: isImg ? 'image' : 'document',
        media_url: dataUrl,
        is_internal: false,
        is_supervisor_override: Boolean(
          isSupervisorMode && (supervisorIntervention || impersonatedSeller)
        ),
      });
    };
    reader.readAsDataURL(file);
  };

  const ChannelIcon = currentContact?.channel === 'instagram' ? Instagram : MessageCircle;

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-canvas text-fg">
      {/* =================================================================== */}
      {/* COLUNA 1: FILA DE CONVERSAS                                         */}
      {/* =================================================================== */}
      <div className="w-80 h-full border-r border-line bg-surface flex flex-col shrink-0">
        {/* Topo da lista (h-14) */}
        <div className="h-14 px-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg truncate">
              Conversas
            </h2>
            <p className="text-2xs text-muted truncate">
              {contacts.length} contatos ativos
            </p>
          </div>
          {isSupervisorMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSellersModal}
              title="Gerenciar equipe de vendedores"
            >
              <Users size={14} />
              <span>Equipe</span>
            </Button>
          )}
        </div>

        {/* Busca e Filtros */}
        <div className="p-3 border-b border-line space-y-2.5 shrink-0 bg-canvas/40">
          {/* Campo de busca com botão de limpeza rápida */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-2.5 text-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, telefone ou tag..."
              className={cn(fieldClass, 'pl-8 pr-7')}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 rounded p-0.5 text-muted hover:bg-elevated hover:text-fg transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtro do Supervisor: Carteira + Roleta */}
          {isSupervisorMode && (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Filtrar por carteira do vendedor"
                value={supervisorSellerFilter}
                onChange={(e) => setSupervisorSellerFilter(e.target.value)}
                className="flex-1 min-w-0 h-7 rounded-md border border-line bg-canvas px-2 text-2xs text-fg focus:border-primary/60 focus:outline-none cursor-pointer"
              >
                <option value="">Todas as carteiras ({contacts.length})</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    Carteira: {s.name}
                  </option>
                ))}
              </select>

              {onRoundRobinAssign && countWaiting > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onRoundRobinAssign(activeSellerName)}
                  title="Distribuir fila de espera automaticamente entre vendedores"
                  className="h-7 text-2xs"
                >
                  <Shuffle size={11} />
                  <span>Roleta ({countWaiting})</span>
                </Button>
              )}
            </div>
          )}

          {/* Abas de status */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
            {(isSupervisorMode
              ? [
                  { id: 'all', label: 'Todos', count: contacts.length },
                  {
                    id: 'mine',
                    label: impersonatedSeller ? 'Conta' : 'Meus',
                    count: countMine,
                  },
                  { id: 'waiting', label: 'Fila', count: countWaiting },
                  { id: 'others', label: 'Colegas', count: countOthers },
                  { id: 'bot', label: 'IA' },
                ]
              : [
                  { id: 'mine', label: 'Meus atendimentos', count: countMine },
                  { id: 'waiting', label: 'Fila de espera', count: countWaiting },
                ]
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    'px-2 py-1 rounded text-2xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-elevated text-fg border border-line-strong'
                      : 'text-muted hover:text-fg hover:bg-elevated/40'
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="ml-1 text-muted tabular-nums">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtro segmentado de canais */}
          <Segmented
            className="w-full"
            value={channelFilter}
            onChange={(id) => setChannelFilter(id)}
            items={[
              { id: '', label: 'Todos canais' },
              { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
              { id: 'instagram', label: 'Instagram', icon: Instagram },
            ]}
          />
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60">
          {filteredContacts.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nenhuma conversa"
              description="Nenhum contato encontrado para o filtro atual."
            />
          ) : (
            filteredContacts.map((c) => {
              const selected = c.id === selectedContactId;
              const unread = Number(c.unread_count || 0);
              const cIsMine =
                (c.attendance_status === 'human' || c.ai_enabled === false) &&
                (c.seller_id === effectiveSeller?.id ||
                  c.assignee === activeSellerName);
              const cIsOther =
                (c.attendance_status === 'human' || c.ai_enabled === false) &&
                c.assignee &&
                !cIsMine &&
                c.assignee !== 'Agente IA' &&
                c.assignee !== 'Fila de Espera Humana';

              const CIcon = c.channel === 'instagram' ? Instagram : MessageCircle;

              return (
                <button
                  key={c.id}
                  onClick={() => onSelectContact(c.id)}
                  className={cn(
                    'relative w-full p-3 text-left flex items-start gap-3 transition-colors',
                    selected
                      ? 'bg-elevated'
                      : 'hover:bg-elevated/50'
                  )}
                >
                  {selected && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                  )}

                  <Avatar
                    name={c.name}
                    size="md"
                    tone={unread > 0 ? 'primary' : 'neutral'}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-xs',
                          unread > 0 ? 'font-semibold text-fg' : 'font-medium text-fg'
                        )}
                      >
                        {c.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unread > 0 && !selected && (
                          <CountPill value={unread} />
                        )}
                        <span className="text-2xs tabular-nums text-muted">
                          {formatTime(c.updated_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-2xs text-muted truncate mt-0.5">
                      {c.phone && c.phone.replace(/\D/g, '').length <= 13 ? (
                        c.phone
                      ) : (
                        <span className="flex items-center gap-1 text-muted text-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0"></span>
                          <span className="truncate">WhatsApp Business (Meta ID)</span>
                        </span>
                      )}
                    </div>

                    {/* Metadados de posse e canal */}
                    <div className="flex items-center gap-2 mt-1.5 text-2xs text-muted">
                      <span className="flex items-center gap-1 shrink-0">
                        <CIcon size={11} className="text-muted" />
                        <span className="capitalize">{c.channel}</span>
                      </span>

                      <span>·</span>

                      <span className="truncate">
                        {cIsMine ? (
                          <span className="text-primary font-medium">
                            {impersonatedSeller ? `Espelhado (${c.assignee})` : 'Com você'}
                          </span>
                        ) : cIsOther ? (
                          <span>Com {c.assignee}</span>
                        ) : (
                          <span className="text-muted">Agente IA</span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* COLUNA 2: FEED DE CHAT & BARRA DE ENVIO                             */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas">
        {!currentContact ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-xl border border-line bg-surface p-2.5 mb-3 flex items-center justify-center">
              <img
                src={regenLogo}
                alt="REGEN FLOW"
                className="w-full h-full object-contain rounded-md"
              />
            </div>
            <h3 className="text-sm font-semibold text-fg">
              Selecione uma conversa
            </h3>
            <p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
              Assuma atendimentos, transfira para colegas da equipe ou acompanhe as respostas automáticas da IA em tempo real.
            </p>
          </div>
        ) : (
          <>
            {/* Cabeçalho do Chat (h-14) */}
            <header className="h-14 px-4 bg-surface border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar name={currentContact.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-sm text-fg truncate">
                      {currentContact.name}
                    </h3>
                    <Badge variant="outline">
                      <ChannelIcon size={11} />
                      <span className="capitalize">{currentContact.channel}</span>
                    </Badge>
                    {currentContact.phone && currentContact.phone.replace(/\D/g, '').length <= 13 ? (
                      <span className="text-2xs text-muted font-mono">
                        {currentContact.phone}
                      </span>
                    ) : (
                      <span className="text-2xs text-muted/80 bg-elevated px-1.5 py-0.5 rounded border border-line" title="Conta com ID de privacidade Meta">
                        Meta ID Protegido
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-muted truncate">
                    {isMine
                      ? `Atendimento fixado com ${currentContact.assignee}`
                      : isLockedForMe
                      ? `Em atendimento por ${currentContact.assignee}`
                      : 'Qualificação automática da IA'}
                  </p>
                </div>
              </div>

              {/* Ações do cabeçalho */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isMine ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const colleagues = sellers.filter(
                          (s) => s.id !== effectiveSeller?.id
                        );
                        setTransferTargetId(colleagues[0]?.id || '');
                        setShowTransferModal(true);
                      }}
                    >
                      <ArrowRightLeft size={13} />
                      <span>Transferir</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onAssignContact(currentContact.id, {
                          assignee: 'Agente IA',
                          seller_id: null,
                          ai_enabled: true,
                          attendance_status: 'bot',
                          operator_name: activeSellerName,
                        })
                      }
                    >
                      <Bot size={13} />
                      <span className="hidden md:inline">Devolver à IA</span>
                    </Button>
                  </>
                ) : isLockedForMe ? (
                  isSupervisorMode ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const ownerObj = sellers.find(
                            (s) =>
                              s.id === currentContact.seller_id ||
                              s.name.toLowerCase() ===
                                (currentContact.assignee || '').toLowerCase()
                          );
                          if (ownerObj) {
                            onImpersonateSeller?.(ownerObj);
                          }
                        }}
                        title={`Entrar na conta de ${currentContact.assignee} para operar como ele`}
                      >
                        <Eye size={13} className="text-accent" />
                        <span>Espelhar conta</span>
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const colleagues = sellers.filter(
                            (s) => s.name !== currentContact.assignee
                          );
                          setTransferTargetId(colleagues[0]?.id || '');
                          setShowTransferModal(true);
                        }}
                      >
                        <ArrowRightLeft size={13} />
                        <span>Transferir</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-elevated border border-line text-2xs font-medium text-muted">
                      <Lock size={11} />
                      <span>Com {currentContact.assignee.split(' ')[0]}</span>
                    </span>
                  )
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      onAssignContact(currentContact.id, {
                        assignee: activeSellerName,
                        seller_id: effectiveSeller?.id,
                        ai_enabled: false,
                        attendance_status: 'human',
                        operator_name: activeSellerName,
                      })
                    }
                  >
                    <UserCheck size={13} />
                    <span>Assumir conversa</span>
                  </Button>
                )}

                <IconButton
                  label={drawerOpen ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                  size="sm"
                  onClick={() => setDrawerOpen(!drawerOpen)}
                >
                  {drawerOpen ? (
                    <PanelRightClose size={16} />
                  ) : (
                    <PanelRightOpen size={16} />
                  )}
                </IconButton>
              </div>
            </header>

            {/* Sub-Abas do Chat */}
            <div className="h-10 px-4 bg-surface border-b border-line flex items-center justify-between gap-3 shrink-0">
              <Tabs
                value={chatSubTab}
                onChange={(id) => setChatSubTab(id)}
                items={[
                  { id: 'attendance', label: 'Atendimento', icon: MessageCircle },
                  { id: 'notes', label: 'Notas internas', icon: StickyNote },
                  { id: 'simulator', label: 'Simulador', icon: FlaskConical },
                ]}
              />

              <div className="flex items-center gap-2 text-2xs text-muted shrink-0">
                {impersonatedSeller ? (
                  <span className="inline-flex items-center gap-1.5 text-accent font-medium">
                    <Eye size={12} />
                    <span>Conta de {impersonatedSeller.name}</span>
                    <button
                      onClick={onExitImpersonation}
                      className="ml-1 text-2xs underline hover:text-fg"
                    >
                      Sair
                    </button>
                  </span>
                ) : (
                  <span className="hidden md:inline">
                    {isSupervisorMode ? 'Supervisor' : 'Vendedor'}:{' '}
                    <strong className="text-fg font-medium">
                      {activeSellerName}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Feed de Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-canvas">
              {displayedMessages.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Nenhuma mensagem nesta aba"
                  description="As mensagens do cliente, notas da equipe ou simulações aparecerão aqui."
                />
              ) : (
                displayedMessages.map((m) => {
                  const isCustomer = m.sender === 'contact';
                  const isSystem = m.sender === 'system';
                  const isInternal = m.is_internal || m.sender === 'internal';
                  const isIgComment = m.media_type === 'ig_comment';
                  const isIgCommentReply = m.media_type === 'ig_comment_reply';

                  if (isSystem) {
                    return (
                      <div
                        key={m.id}
                        className="my-3 flex items-center justify-center text-center"
                      >
                        <span className="inline-block px-3 py-1 rounded-full border border-line bg-surface text-2xs text-muted max-w-md">
                          {m.content} · {formatTime(m.timestamp)}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex flex-col max-w-[76%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed border transition-colors',
                        isCustomer
                          ? 'mr-auto bg-elevated border-line text-fg rounded-tl-none'
                          : isInternal
                          ? 'ml-auto bg-accent/10 border-accent/30 text-fg rounded-tr-none'
                          : isIgCommentReply
                          ? 'ml-auto bg-secondary/15 border-secondary/30 text-fg rounded-tr-none'
                          : 'ml-auto bg-secondary/15 border-secondary/30 text-fg rounded-tr-none'
                      )}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1 text-2xs text-muted font-medium">
                        <span className="flex items-center gap-1.5 truncate">
                          {isCustomer
                            ? currentContact.name
                            : isInternal
                            ? 'Nota interna da equipe'
                            : m.sender === 'agent'
                            ? 'Agente IA'
                            : currentContact.assignee || activeSellerName}

                          {isIgComment && (
                            <Badge variant="outline">
                              <Instagram size={10} /> Comentário
                            </Badge>
                          )}
                          {isIgCommentReply && (
                            <Badge variant="outline">
                              Resposta pública
                            </Badge>
                          )}
                        </span>

                        <span className="flex items-center gap-1 tabular-nums shrink-0">
                          {formatTime(m.timestamp)}
                          {!isCustomer && (
                            <>
                              {m.delivery_status === 'read' ? (
                                <CheckCheck size={13} className="text-primary" title="Lida pelo cliente" />
                              ) : m.delivery_status === 'delivered' ? (
                                <CheckCheck size={13} className="text-muted" title="Entregue no WhatsApp do cliente" />
                              ) : m.delivery_status === 'failed' ? (
                                <AlertCircle size={13} className="text-accent" title="Falha no envio" />
                              ) : (
                                <Check size={13} className="text-muted" title="Enviada ao servidor" />
                              )}
                            </>
                          )}
                        </span>
                      </div>

                      <div className="whitespace-pre-line break-words text-fg">
                        {m.content}
                      </div>

                      {m.media_type === 'audio' && m.media_url && (
                        <div className="mt-2 pt-1.5 border-t border-line">
                          <audio
                            controls
                            src={m.media_url}
                            className="h-8 max-w-full rounded"
                          />
                        </div>
                      )}

                      {m.media_type === 'image' && m.media_url && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(m.media_url)}
                            className="group relative block overflow-hidden rounded-md border border-line focus:outline-none"
                            title="Ampliar imagem"
                          >
                            <img
                              src={m.media_url}
                              alt="Anexo da conversa"
                              loading="lazy"
                              className="max-h-56 object-cover transition-transform duration-150 group-hover:scale-[1.01]"
                            />
                          </button>
                        </div>
                      )}

                      {m.media_type === 'document' && m.media_url && (
                        <div className="mt-2">
                          <a
                            href={m.media_url}
                            download="documento"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-line bg-canvas text-2xs font-medium text-fg hover:bg-elevated transition"
                          >
                            <FileText size={13} />
                            <span>Baixar arquivo anexado</span>
                          </a>
                        </div>
                      )}

                      {isIgComment && !isInputBlocked && (
                        <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between gap-2">
                          <span className="text-2xs text-muted">
                            Responder no Post + Direct
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowIgCommentModal(true)}
                          >
                            <CornerDownRight size={11} />
                            <span>Responder no Direct</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Banner de posse quando bloqueado */}
            {isLockedForMe && chatSubTab === 'attendance' && (
              <div className="px-4 py-2.5 border-t border-line bg-surface flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-muted">
                  {isSupervisorMode ? (
                    <Crown size={15} className="text-primary shrink-0" />
                  ) : (
                    <Lock size={15} className="text-accent shrink-0" />
                  )}
                  <span>
                    {isSupervisorMode ? (
                      <>
                        Cliente em atendimento por{' '}
                        <strong className="text-fg font-medium">
                          {currentContact.assignee}
                        </strong>
                        . Como supervisor você pode intervir diretamente.
                      </>
                    ) : (
                      <>
                        Chat bloqueado — exclusivo de{' '}
                        <strong className="text-fg font-medium">
                          {currentContact.assignee}
                        </strong>
                        .
                      </>
                    )}
                  </span>
                </div>

                {isSupervisorMode && (
                  <Button
                    variant={supervisorIntervention ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() =>
                      setSupervisorIntervention(!supervisorIntervention)
                    }
                  >
                    {supervisorIntervention
                      ? 'Intervenção ativa'
                      : 'Liberar digitação'}
                  </Button>
                )}
              </div>
            )}

            {/* Menu flutuante de respostas rápidas */}
            {showQuickReplies && (
              <div className="mx-4 mb-2 p-2 rounded-lg bg-surface border border-line-strong shadow-popover max-h-48 overflow-y-auto space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-2xs font-medium text-muted border-b border-line">
                  <span>Atalhos de respostas rápidas</span>
                  <IconButton
                    label="Fechar atalhos"
                    size="sm"
                    onClick={() => setShowQuickReplies(false)}
                  >
                    <X size={12} />
                  </IconButton>
                </div>
                {quickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => {
                      setMessageText(qr.content);
                      setShowQuickReplies(false);
                    }}
                    className="w-full text-left p-2 rounded hover:bg-elevated text-xs flex items-center justify-between gap-2 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-2xs font-semibold text-primary">
                        {qr.shortcut}
                      </span>
                      <span className="font-medium text-fg truncate">
                        {qr.title}
                      </span>
                    </div>
                    <span className="text-2xs text-muted truncate max-w-xs">
                      {qr.content}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Barra de Envio (Composer) */}
            <form
              onSubmit={handleSendSubmit}
              className="p-3 bg-surface border-t border-line space-y-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileAttachmentChange}
                className="hidden"
              />

              <div className="relative">
                <input
                  type="text"
                  disabled={isInputBlocked}
                  value={messageText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMessageText(val);
                    if (val === '/') {
                      setShowQuickReplies(true);
                    } else if (!val.startsWith('/') && showQuickReplies) {
                      setShowQuickReplies(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && showQuickReplies) {
                      setShowQuickReplies(false);
                    }
                  }}
                  placeholder={
                    isInputBlocked
                      ? `Chat em modo leitura — operador responsável: ${currentContact.assignee}`
                      : chatSubTab === 'notes'
                      ? 'Adicionar nota interna para a equipe...'
                      : chatSubTab === 'simulator'
                      ? 'Simular mensagem enviada pelo cliente...'
                      : impersonatedSeller
                      ? `Respondendo como ${impersonatedSeller.name} (digite / para atalhos)...`
                      : `Responder como ${activeSellerName} (digite / para atalhos)...`
                  }
                  className={cn(fieldClass, 'h-9 px-3 text-xs')}
                />
              </div>

              {/* Barra de ferramentas do composer */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isInputBlocked}
                    onClick={() => setShowQuickReplies(!showQuickReplies)}
                    title="Respostas rápidas (/)"
                  >
                    <Zap size={13} className="text-primary" />
                    <span>Atalhos</span>
                  </Button>

                  <IconButton
                    label="Anexar arquivo"
                    size="sm"
                    disabled={isInputBlocked}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={14} />
                  </IconButton>

                  <IconButton
                    label={
                      isRecordingAudio
                        ? 'Finalizar e enviar áudio'
                        : 'Gravar áudio'
                    }
                    size="sm"
                    disabled={isInputBlocked}
                    onClick={handleToggleAudioRecording}
                    active={isRecordingAudio}
                  >
                    {isRecordingAudio ? (
                      <span className="flex items-center gap-1 text-2xs font-mono text-primary animate-pulse">
                        <Square size={12} />
                        0:{String(recordingSeconds).padStart(2, '0')}
                      </span>
                    ) : (
                      <Mic size={14} />
                    )}
                  </IconButton>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isInputBlocked}
                    onClick={() => setShowTemplateModal(true)}
                  >
                    <Sparkles size={13} className="text-primary" />
                    <span className="hidden sm:inline">Template HSM</span>
                  </Button>

                  {currentContact?.channel === 'instagram' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isInputBlocked}
                      onClick={() => setShowIgCommentModal(true)}
                    >
                      <Instagram size={13} />
                      <span className="hidden sm:inline">Responder Post</span>
                    </Button>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!messageText.trim() || isInputBlocked}
                >
                  <Send size={13} />
                  <span>Enviar</span>
                </Button>
              </div>
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
          isSupervisorMode={isSupervisorMode}
          canReassignSeller={Boolean(isSupervisorMode)}
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
          onExportLgpd={onExportLgpd}
          onAnonymizeLgpd={onAnonymizeLgpd}
          onToggleConsent={onToggleConsent}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL: TRANSFERÊNCIA DE ATENDIMENTO                                 */}
      {/* =================================================================== */}
      {showTransferModal && currentContact && (
        <Modal
          title="Transferir atendimento"
          description={`Reatribuir a conversa de ${currentContact.name} para outro vendedor:`}
          onClose={() => setShowTransferModal(false)}
          as="form"
          onSubmit={handleConfirmTransfer}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTransferModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Confirmar transferência
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Vendedor de destino">
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className={fieldClass}
              >
                {sellers
                  .filter((s) => s.id !== activeSeller?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Observação interna (opcional)">
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ex: Cliente solicitou negociação de atacado..."
                className={textareaClass}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL: DISPARO DE TEMPLATES HSM (META)                             */}
      {/* =================================================================== */}
      {showTemplateModal && currentContact && (
        <Modal
          title="Templates oficiais Meta (HSM)"
          description={
            windowInfo?.reason ||
            'Selecione um template aprovado para iniciar ou restabelecer a janela oficial de 24h.'
          }
          onClose={() => setShowTemplateModal(false)}
          size="lg"
        >
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(windowInfo?.templates || []).map((tpl) => (
              <div
                key={tpl.name}
                className="p-3 rounded-lg border border-line bg-canvas flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-fg">
                    {tpl.title}{' '}
                    <span className="font-mono text-2xs text-muted">
                      ({tpl.name})
                    </span>
                  </div>
                  <p className="text-2xs text-muted mt-0.5 leading-relaxed">
                    {tpl.preview}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await onSendTemplate({
                      contact_id: currentContact.id,
                      template_name: tpl.name,
                      language_code: tpl.language,
                      sender_name: activeSellerName,
                    });
                    setShowTemplateModal(false);
                  }}
                >
                  Disparar
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL: INSTAGRAM COMMENT-TO-DM                                      */}
      {/* =================================================================== */}
      {showIgCommentModal && currentContact && (
        <Modal
          title="Responder comentário no Instagram"
          description={`Responda publicamente na publicação e envie simultaneamente uma mensagem privada no Direct para ${currentContact.name}.`}
          onClose={() => setShowIgCommentModal(false)}
          as="form"
          size="lg"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!onReplyInstagramComment) return;
            if (!igPublicReply.trim() && !igPrivateDm.trim()) return;
            setIgSending(true);
            try {
              await onReplyInstagramComment({
                contact_id: currentContact.id,
                public_reply: igPublicReply.trim(),
                private_dm: igPrivateDm.trim(),
                sender_name: activeSellerName,
                is_supervisor_override: Boolean(
                  isSupervisorMode &&
                    (supervisorIntervention || impersonatedSeller)
                ),
              });
              setShowIgCommentModal(false);
            } finally {
              setIgSending(false);
            }
          }}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowIgCommentModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  igSending || (!igPublicReply.trim() && !igPrivateDm.trim())
                }
              >
                {igSending ? 'Enviando...' : 'Enviar resposta e Direct'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field
              label="Resposta pública no comentário do post"
              hint="Ficará visível abaixo do comentário na publicação ou Reels."
            >
              <textarea
                rows={2}
                value={igPublicReply}
                onChange={(e) => setIgPublicReply(e.target.value)}
                placeholder="Ex: Olá! Enviamos as informações no seu Direct agora mesmo."
                className={textareaClass}
              />
            </Field>

            <Field
              label="Mensagem privada no Direct (Comment-to-DM)"
              hint="Abre a conversa no Direct vinculada ao comentário do cliente."
            >
              <textarea
                rows={3}
                value={igPrivateDm}
                onChange={(e) => setIgPrivateDm(e.target.value)}
                placeholder="Ex: Olá! Vi seu comentário no post. Como podemos te ajudar?"
                className={textareaClass}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL: VISUALIZAÇÃO AMPLIADA DE IMAGEM                              */}
      {/* =================================================================== */}
      {previewImage && (
        <Modal
          title="Visualização de mídia"
          onClose={() => setPreviewImage(null)}
          size="lg"
        >
          <div className="flex items-center justify-center bg-canvas p-2 rounded-lg border border-line">
            <img
              src={previewImage}
              alt="Visualização ampliada"
              className="max-h-[70vh] w-auto rounded object-contain"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

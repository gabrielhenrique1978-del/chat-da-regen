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
  Eye,
  Crown,
  Mic,
  Square,
  Shuffle,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { cn, formatTime, getInitials } from '../lib/utils';
import ContactDrawer from './ContactDrawer';
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
  const [statusFilter, setStatusFilter] = useState('all'); // all, mine, waiting, others, bot
  const [channelFilter, setChannelFilter] = useState(''); // '', whatsapp, instagram
  const [supervisorSellerFilter, setSupervisorSellerFilter] = useState(''); // '', seller_id
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
    'Olá! Respondemos você no Direct com todos os detalhes! 🚀📩'
  );
  const [igPrivateDm, setIgPrivateDm] = useState(
    'Olá! Vi seu comentário na nossa publicação do Instagram 😊 Como posso te ajudar hoje?'
  );
  const [igSending, setIgSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

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
  const activeSellerName = effectiveSeller?.name || 'Lucas Silva';

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
  // Bloqueia o input se for outro vendedor E o supervisor não tiver ativado intervenção direta
  const isInputBlocked =
    isLockedForMe &&
    chatSubTab === 'attendance' &&
    !(isSupervisorMode && supervisorIntervention);

  // Contadores de filtros baseados na conta ativa (ou conta espelhada pelo Supervisor)
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

    if (isSupervisorMode && supervisorSellerFilter) {
      const targetS = sellers.find((s) => s.id === supervisorSellerFilter);
      const matchSeller =
        c.seller_id === supervisorSellerFilter ||
        (targetS &&
          (c.assignee || '').toLowerCase() === targetS.name.toLowerCase());
      if (!matchSeller) return false;
    }

    const cIsMine =
      (c.attendance_status === 'human' || c.ai_enabled === false) &&
      (c.seller_id === effectiveSeller?.id || c.assignee === activeSellerName);
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
        content: `🔒 [Nota de ${senderLabel}]: ${text}`,
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

  // Gravação de Áudio PTT (Microfone Real ou Fallback Sintetizado em Ambientes sem Microfone)
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
      // Fallback caso o navegador não tenha permissão de microfone física
      if (onSendMessage) {
        await onSendMessage({
          contact_id: currentContact.id,
          content: '🎙️ [Nota de Voz Enviada (0:06)]',
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

  // Anexo de Arquivos (Imagens, PDFs, Catálogos, Comprovantes)
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
          ? `📷 [Imagem Anexada: ${file.name}]`
          : `📎 [Documento Anexado: ${file.name} (${Math.round(
              file.size / 1024
            )} KB)]`,
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

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#0A0D14] text-[#F8FAFC]">
      {/* =================================================================== */}
      {/* COLUNA 1: PAINEL DE CONVERSAS (FILA OMNICHANNEL)                     */}
      {/* =================================================================== */}
      <div className="w-80 h-full border-r border-[#1E293B] bg-[#121824] flex flex-col shrink-0">
        {/* Topo da Lista (Alinhado em h-16 com Sidebar, Chat e Gaveta) */}
        <div className="h-16 px-4 border-b border-[#1E293B] flex items-center justify-between shrink-0">
          <div className="min-w-0 flex items-center gap-2.5">
            <img
              src={regenLogo}
              alt="REGEN FLOW"
              className="w-7 h-7 rounded-lg object-contain border border-[#1E293B] shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-[#F8FAFC] truncate">
                Conversas & Fila
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                WhatsApp Oficial & Instagram
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSellersModal}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1B2333] text-[#F8FAFC] hover:text-[#00D2FF] border border-[#1E293B] text-xs font-semibold hover:border-[#00D2FF]/30 transition shrink-0"
            title="Gerenciar equipe de vendedores"
          >
            <Users size={13} className="text-[#00D2FF]" />
            <span>Equipe</span>
          </button>
        </div>

        {/* Barra de Busca e Filtros */}
        <div className="p-3 border-b border-[#1E293B] space-y-2 shrink-0 bg-[#0A0D14]/60">
          {/* Busca Rápida */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-2.5 text-[#94A3B8]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, telefone ou #tag..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[#1E293B] bg-[#121824] text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF] transition"
            />
          </div>

          {/* Filtro Exclusivo de Supervisor: Inspecionar Carteira por Vendedor + Roleta Round-Robin */}
          {isSupervisorMode && (
            <div className="flex items-center gap-1.5">
              <select
                value={supervisorSellerFilter}
                onChange={(e) => setSupervisorSellerFilter(e.target.value)}
                className="flex-1 min-w-0 rounded-xl border border-[#1E293B] bg-[#121824] px-2.5 py-1.5 text-[11px] font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF] cursor-pointer"
              >
                <option value="">
                  👑 Supervisor: Todas Carteiras ({contacts.length})
                </option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    🎧 Carteira de: {s.name}
                  </option>
                ))}
              </select>

              {onRoundRobinAssign && countWaiting > 0 && (
                <button
                  type="button"
                  onClick={() => onRoundRobinAssign(activeSellerName)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-[10px] font-bold inline-flex items-center gap-1 shrink-0 transition"
                  title="Distribuir clientes da Fila de Espera automaticamente entre os vendedores ativos (Roleta Round-Robin)"
                >
                  <Shuffle size={12} />
                  <span>Roleta ({countWaiting})</span>
                </button>
              )}
            </div>
          )}

          {/* Filtros de Status / Posse */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `Todos (${contacts.length})` },
              {
                id: 'mine',
                label: impersonatedSeller
                  ? `Dele (${countMine})`
                  : `Meus (${countMine})`,
              },
              { id: 'waiting', label: `Fila (${countWaiting})` },
              { id: 'others', label: `Colegas (${countOthers})` },
              { id: 'bot', label: 'IA' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition',
                  statusFilter === tab.id
                    ? 'bg-[#1B2333] text-[#00D2FF] border border-[#00D2FF]/40'
                    : 'bg-[#121824] text-[#94A3B8] border border-[#1E293B] hover:bg-[#1B2333] hover:text-[#F8FAFC]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro por Canal */}
          <div className="grid grid-cols-3 gap-1 text-[11px]">
            {[
              { id: '', label: 'Todos Canais' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'instagram', label: 'Instagram' },
            ].map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChannelFilter(ch.id)}
                className={cn(
                  'py-1 rounded-lg font-medium border transition text-center truncate',
                  channelFilter === ch.id
                    ? 'border-[#00D2FF]/40 bg-[#1B2333] text-[#00D2FF]'
                    : 'border-transparent text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333]'
                )}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#1E293B]/60">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#94A3B8]">
              Nenhuma conversa encontrada para este filtro.
            </div>
          ) : (
            filteredContacts.map((c) => {
              const selected = c.id === selectedContactId;
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

              return (
                <button
                  key={c.id}
                  onClick={() => onSelectContact(c.id)}
                  className={cn(
                    'w-full p-3.5 text-left flex items-start gap-3 transition-colors',
                    selected
                      ? 'bg-[#1B2333] border-l-2 border-l-[#00D2FF]'
                      : 'hover:bg-[#1B2333]/60'
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-[#00D2FF] font-bold text-xs flex items-center justify-center shrink-0">
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-[#F8FAFC] truncate">
                        {c.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {Number(c.unread_count || 0) > 0 && !selected && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#00D2FF] text-[#0A0D14] text-[9px] font-extrabold">
                            {c.unread_count}
                          </span>
                        )}
                        <span className="text-[10px] text-[#94A3B8]">
                          {formatTime(c.updated_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#94A3B8] truncate mt-0.5">
                      {c.phone || c.email || 'Canal digital'}
                    </div>

                    {/* Badges de Posse do Vendedor e Canal */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-[#0A0D14] border border-[#1E293B] text-[#94A3B8]">
                        {c.channel}
                      </span>
                      {cIsMine ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20">
                          ✓ {impersonatedSeller ? 'Conta Espelhada' : 'Seu'} ({c.assignee})
                        </span>
                      ) : cIsOther ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1B2333] text-[#A5B4FC] border border-[#6366F1]/30">
                          🔒 Com: {c.assignee}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#0A0D14] text-[#94A3B8] border border-[#1E293B]">
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
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0A0D14]">
        {!currentContact ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#121824] border border-[#1E293B] p-2 mb-4 shadow-card">
              <img
                src={regenLogo}
                alt="REGEN FLOW"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <h3 className="font-bold text-sm text-[#F8FAFC]">
              Selecione uma conversa ao lado
            </h3>
            <p className="text-xs text-[#94A3B8] max-w-sm mt-1">
              Assuma atendimentos em 1 clique, transfira para colegas da equipe
              ou acompanhe a qualificação automática da IA.
            </p>
          </div>
        ) : (
          <>
            {/* Cabeçalho do Chat (Alinhado em h-16 com as demais colunas) */}
            <header className="h-16 px-4 bg-[#121824] border-b border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-[#1B2333] border border-[#1E293B] text-[#00D2FF] font-bold text-xs flex items-center justify-center shrink-0">
                  {getInitials(currentContact.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-sm text-[#F8FAFC] truncate">
                      {currentContact.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[#0A0D14] text-[#94A3B8] border border-[#1E293B] shrink-0">
                      {currentContact.channel}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] truncate">
                    {isMine
                      ? `🎧 Fixado com ${currentContact.assignee}`
                      : isLockedForMe
                      ? `🔒 Em atendimento por ${currentContact.assignee}`
                      : '🤖 Qualificação Automática IA'}
                  </p>
                </div>
              </div>

              {/* Botões de Posse, Espelhamento de Supervisor e Gaveta */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isMine ? (
                  <>
                    <button
                      onClick={() => {
                        const colleagues = sellers.filter(
                          (s) => s.id !== effectiveSeller?.id
                        );
                        setTransferTargetId(colleagues[0]?.id || '');
                        setShowTransferModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1E293B] bg-[#1B2333] hover:border-[#00D2FF]/40 text-xs font-semibold text-[#F8FAFC] whitespace-nowrap transition"
                    >
                      <ArrowRightLeft size={13} className="text-[#00D2FF]" />
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1E293B] bg-[#0A0D14] hover:bg-[#1B2333] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] whitespace-nowrap transition"
                    >
                      <Bot size={14} className="text-[#00D2FF]" />
                      <span className="hidden xl:inline">Devolver à IA</span>
                    </button>
                  </>
                ) : isLockedForMe ? (
                  isSupervisorMode ? (
                    <div className="flex items-center gap-1.5">
                      <button
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
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1B2333] hover:bg-[#6366F1]/20 border border-[#6366F1]/40 text-[#A5B4FC] text-xs font-semibold whitespace-nowrap transition"
                        title={`Entrar na conta de ${currentContact.assignee} para operar como ele`}
                      >
                        <Eye size={13} className="text-[#6366F1]" />
                        <span>Espelhar Conta</span>
                      </button>

                      <button
                        onClick={() => {
                          const colleagues = sellers.filter(
                            (s) => s.name !== currentContact.assignee
                          );
                          setTransferTargetId(colleagues[0]?.id || '');
                          setShowTransferModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold whitespace-nowrap transition"
                        title="Como Supervisor, você pode reatribuir ou destravar este atendimento"
                      >
                        <ArrowRightLeft size={13} />
                        <span>Transferir</span>
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1B2333] border border-[#1E293B] text-[#94A3B8] text-xs font-semibold whitespace-nowrap">
                      <Lock size={12} />
                      <span>Com {currentContact.assignee.split(' ')[0]}</span>
                    </span>
                  )
                ) : (
                  <button
                    onClick={() =>
                      onAssignContact(currentContact.id, {
                        assignee: activeSellerName,
                        seller_id: effectiveSeller?.id,
                        ai_enabled: false,
                        attendance_status: 'human',
                        operator_name: activeSellerName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold whitespace-nowrap transition shadow-xs"
                  >
                    <UserCheck size={14} />
                    <span>Assumir Conversa</span>
                  </button>
                )}

                <button
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  className="p-1.5 rounded-lg border border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333] shrink-0 transition"
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
            <div className="px-4 py-2 bg-[#121824] border-b border-[#1E293B] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  {
                    id: 'attendance',
                    label: 'Atendimento',
                    icon: MessageCircle,
                  },
                  {
                    id: 'notes',
                    label: 'Notas da Equipe',
                    icon: StickyNote,
                  },
                  {
                    id: 'simulator',
                    label: 'Simulador',
                    icon: FlaskConical,
                  },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setChatSubTab(t.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition',
                        chatSubTab === t.id
                          ? 'bg-[#1B2333] text-[#00D2FF] border border-[#00D2FF]/30'
                          : 'text-[#94A3B8] hover:bg-[#1B2333]/50 hover:text-[#F8FAFC]'
                      )}
                    >
                      <Icon size={13} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 shrink-0 text-[11px]">
                {impersonatedSeller ? (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1B2333] border border-[#6366F1]/30 text-[#A5B4FC] font-medium">
                    <Eye size={12} className="text-[#6366F1]" />
                    <span>Conta de: {impersonatedSeller.name}</span>
                    <button
                      onClick={onExitImpersonation}
                      className="ml-1 px-1.5 py-0.5 rounded bg-[#6366F1]/30 text-[#F8FAFC] text-[10px] hover:bg-[#6366F1]/50 transition"
                    >
                      Sair
                    </button>
                  </div>
                ) : (
                  <span className="text-[#94A3B8] hidden md:inline">
                    {isSupervisorMode ? '👑 Supervisor:' : '🔒 Vendedor:'}{' '}
                    <strong className="text-[#F8FAFC]">
                      {activeSellerName}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Feed de Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#0A0D14]">
              {displayedMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-[#94A3B8]">
                  Nenhuma mensagem registrada nesta aba ainda.
                </div>
              ) : (
                displayedMessages.map((m) => {
                  const isCustomer = m.sender === 'contact';
                  const isSystem = m.sender === 'system';
                  const isInternal = m.is_internal || m.sender === 'internal';
                  const isIgComment = m.media_type === 'ig_comment';
                  const isIgCommentReply = m.media_type === 'ig_comment_reply';

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex flex-col max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed border shadow-subtle',
                        isIgComment
                          ? 'mr-auto bg-[#1B2333] border-pink-500/40 text-[#F8FAFC]'
                          : isCustomer
                          ? 'mr-auto bg-[#1B2333] border-[#1E293B] text-[#F8FAFC]'
                          : isSystem
                          ? 'mx-auto max-w-lg bg-[#121824] border-[#1E293B] text-[#94A3B8] text-center'
                          : isInternal
                          ? 'ml-auto bg-[#1a1c24] border-amber-500/30 text-amber-200'
                          : isIgCommentReply
                          ? 'ml-auto bg-gradient-to-r from-[#831843] to-[#4c1d95] text-[#F8FAFC] border-pink-500/30'
                          : 'ml-auto bg-[#0c2a4d] border border-[#0072FF]/30 text-[#F8FAFC]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1 text-[10px] font-medium text-[#94A3B8]">
                        <span className="flex items-center gap-1.5">
                          {isCustomer
                            ? currentContact.name
                            : isSystem
                            ? 'Sistema'
                            : isInternal
                            ? '🔒 Nota Interna da Equipe'
                            : m.sender === 'agent'
                            ? '🤖 Assistente IA'
                            : `👤 ${currentContact.assignee || activeSellerName}`}
                          {isIgComment && (
                            <span className="px-1.5 py-0.5 rounded-full bg-pink-700 text-white text-[9px] font-bold">
                              📸 Comentário no Post/Reels
                            </span>
                          )}
                          {isIgCommentReply && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-white text-[9px] font-bold">
                              💬 Resposta Pública no Post
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          {formatTime(m.timestamp)}
                          {!isCustomer && !isSystem && (
                            <>
                              {m.delivery_status === 'read' ? (
                                <CheckCheck size={13} className="text-[#00D2FF]" />
                              ) : m.delivery_status === 'failed' ? (
                                <AlertTriangle
                                  size={13}
                                  className="text-rose-400"
                                />
                              ) : (
                                <Check size={13} />
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="whitespace-pre-line break-words text-[#F8FAFC]">
                        {m.content}
                      </div>
                      {m.media_type === 'audio' && m.media_url && (
                        <div className="mt-2 pt-1.5">
                          <audio
                            controls
                            src={m.media_url}
                            className="h-8 max-w-full rounded-lg"
                          />
                        </div>
                      )}
                      {m.media_type === 'image' && m.media_url && (
                        <div className="mt-2">
                          <img
                            src={m.media_url}
                            alt="Anexo de imagem"
                            className="max-h-56 rounded-xl border border-white/10 object-cover"
                          />
                        </div>
                      )}
                      {m.media_type === 'document' && m.media_url && (
                        <div className="mt-2">
                          <a
                            href={m.media_url}
                            download="anexo-documento"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-[11px] font-medium underline"
                          >
                            <FileText size={13} />
                            <span>Baixar Arquivo Anexado</span>
                          </a>
                        </div>
                      )}
                      {isIgComment && !isInputBlocked && (
                        <div className="mt-2.5 pt-2 border-t border-[#1E293B] flex items-center justify-between gap-2">
                          <span className="text-[10px] font-medium text-[#94A3B8]">
                            Responder no Post + Puxar para o Direct (Comment-to-DM)
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowIgCommentModal(true)}
                            className="px-2.5 py-1 rounded-lg bg-pink-700 hover:bg-pink-600 text-white text-[10px] font-bold transition shrink-0"
                          >
                            💬 Responder Post + Direct
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Banner quando outro vendedor é dono da conversa: Diferencia Vendedor Comum vs Supervisor */}
            {isLockedForMe && chatSubTab === 'attendance' && (
              <div
                className={cn(
                  'px-5 py-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs',
                  isSupervisorMode
                    ? 'bg-[#121824] border-[#1E293B] text-[#F8FAFC]'
                    : 'bg-[#121824] border-amber-500/30 text-amber-200'
                )}
              >
                <div className="flex items-center gap-2">
                  {isSupervisorMode ? (
                    <Crown size={16} className="text-[#00D2FF] shrink-0" />
                  ) : (
                    <Lock size={16} className="text-amber-400 shrink-0" />
                  )}
                  <span>
                    {isSupervisorMode ? (
                      <>
                        <strong>Supervisão de Carteira:</strong> Este cliente
                        está em atendimento por{' '}
                        <strong className="text-[#00D2FF]">
                          {currentContact.assignee}
                        </strong>
                        . Como Supervisor, você pode entrar na conta dele ou
                        intervir diretamente.
                      </>
                    ) : (
                      <>
                        <strong>Chat Bloqueado:</strong> Este cliente pertence
                        exclusivamente à carteira de{' '}
                        <strong>{currentContact.assignee}</strong>. Sua sessão
                        está travada como <strong>{activeSellerName}</strong>{' '}
                        (somente leitura).
                      </>
                    )}
                  </span>
                </div>

                {isSupervisorMode && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setSupervisorIntervention(!supervisorIntervention)
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-lg font-bold text-[11px] transition',
                        supervisorIntervention
                          ? 'bg-[#00D2FF] text-[#0A0D14]'
                          : 'bg-[#1B2333] border border-[#1E293B] text-[#F8FAFC] hover:border-[#00D2FF]/40'
                      )}
                    >
                      {supervisorIntervention
                        ? '✓ Intervenção Liberada'
                        : 'Liberar Digitação (Supervisor)'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Popup de Respostas Rápidas (/) */}
            {showQuickReplies && (
              <div className="mx-5 mb-2 p-3 rounded-2xl bg-[#121824] border border-[#1E293B] shadow-card max-h-48 overflow-y-auto space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#00D2FF] pb-1 border-b border-[#1E293B]">
                  <span>⚡ Respostas Rápidas (Clique para usar)</span>
                  <button onClick={() => setShowQuickReplies(false)} className="text-[#94A3B8] hover:text-[#F8FAFC]">✕</button>
                </div>
                {quickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => {
                      setMessageText(qr.content);
                      setShowQuickReplies(false);
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#1B2333] text-xs flex items-center justify-between gap-2 transition"
                  >
                    <div>
                      <span className="font-mono font-bold text-[#00D2FF] mr-2">
                        {qr.shortcut}
                      </span>
                      <span className="font-semibold text-[#F8FAFC]">
                        {qr.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#94A3B8] truncate max-w-xs">
                      {qr.content}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Barra de Digitação */}
            <form
              onSubmit={handleSendSubmit}
              className="p-3.5 bg-[#121824] border-t border-[#1E293B] flex items-center gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileAttachmentChange}
                className="hidden"
              />

              <button
                type="button"
                disabled={isInputBlocked}
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                className="px-2.5 py-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-semibold text-[#F8FAFC] hover:bg-[#1B2333] hover:border-[#00D2FF]/40 disabled:opacity-40 shrink-0 transition"
                title="Respostas Rápidas (/)"
              >
                <Zap size={15} className="inline mr-1 text-[#00D2FF]" />
                Atalhos
              </button>

              <button
                type="button"
                disabled={isInputBlocked}
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#00D2FF] disabled:opacity-40 shrink-0 transition"
                title="Anexar Imagem, Catálogo ou Documento PDF"
              >
                <Paperclip size={15} />
              </button>

              <button
                type="button"
                disabled={isInputBlocked}
                onClick={handleToggleAudioRecording}
                className={cn(
                  'px-2.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition shrink-0 disabled:opacity-40',
                  isRecordingAudio
                    ? 'border-rose-500 bg-rose-600 text-white animate-pulse'
                    : 'border-[#1E293B] bg-[#0A0D14] text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#00D2FF]'
                )}
                title={
                  isRecordingAudio
                    ? 'Clique para finalizar e enviar o áudio gravado'
                    : 'Gravar Nota de Voz (Áudio PTT)'
                }
              >
                {isRecordingAudio ? (
                  <>
                    <Square size={13} />
                    <span>0:{String(recordingSeconds).padStart(2, '0')}</span>
                  </>
                ) : (
                  <Mic size={15} className="text-[#00D2FF]" />
                )}
              </button>

              <button
                type="button"
                disabled={isInputBlocked}
                onClick={() => setShowTemplateModal(true)}
                className="px-2.5 py-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-semibold text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#00D2FF] disabled:opacity-40 shrink-0 transition"
                title="Disparar Template Oficial da Meta (HSM)"
              >
                <Sparkles size={14} className="inline mr-1 text-[#00D2FF]" />
                Template HSM
              </button>

              {currentContact?.channel === 'instagram' && (
                <button
                  type="button"
                  disabled={isInputBlocked}
                  onClick={() => setShowIgCommentModal(true)}
                  className="px-2.5 py-2.5 rounded-xl border border-pink-500/30 bg-[#0A0D14] text-xs font-semibold text-pink-400 hover:bg-[#1B2333] disabled:opacity-40 shrink-0 transition"
                  title="Responder Comentário no Post/Reels do Instagram + Enviar Direct (Comment-to-DM)"
                >
                  📸 Responder Post
                </button>
              )}

              <input
                type="text"
                disabled={isInputBlocked}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={
                  isInputBlocked
                    ? `🔒 Chat bloqueado — em atendimento por ${currentContact.assignee}`
                    : chatSubTab === 'notes'
                    ? 'Escrever nota interna visível apenas para a equipe...'
                    : chatSubTab === 'simulator'
                    ? 'Simular mensagem enviada pelo cliente no WhatsApp...'
                    : impersonatedSeller
                    ? `Respondendo na conta de ${impersonatedSeller.name} (Modo Supervisor)...`
                    : `Responder como ${activeSellerName}...`
                }
                className="flex-1 min-w-0 rounded-xl border border-[#1E293B] bg-[#0A0D14] px-4 py-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF] disabled:opacity-50 transition"
              />

              <button
                type="submit"
                disabled={!messageText.trim() || isInputBlocked}
                className="px-4 py-2.5 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition shrink-0"
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
          canReassignSeller={Boolean(isSupervisorMode || !isLockedForMe)}
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

      {/* Modal de Transferência de Vendedor */}
      {showTransferModal && currentContact && (
        <div className="fixed inset-0 bg-[#0A0D14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmTransfer}
            className="bg-[#121824] border border-[#1E293B] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-card"
          >
            <h3 className="font-bold text-base text-[#F8FAFC]">
              Transferir Atendimento
            </h3>
            <p className="text-xs text-[#94A3B8]">
              Transferindo <strong className="text-[#F8FAFC]">{currentContact.name}</strong> para outro
              vendedor da equipe:
            </p>
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1">
                Selecionar Vendedor Destino
              </label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
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
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1">
                Motivo / Observação Interna (Opcional)
              </label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ex: Cliente pediu orçamento de atacado..."
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 rounded-xl border border-[#1E293B] text-xs font-semibold text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#F8FAFC] transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold transition"
              >
                Confirmar Transferência
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Disparo de Templates HSM Oficiais da Meta */}
      {showTemplateModal && currentContact && (
        <div className="fixed inset-0 bg-[#0A0D14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-[#1E293B] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#F8FAFC]">
                Templates Oficiais Meta (HSM)
              </h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#94A3B8]">
              {windowInfo?.reason ||
                'Selecione um template aprovado para iniciar ou reabrir a janela de 24h.'}
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(windowInfo?.templates || []).map((tpl) => (
                <div
                  key={tpl.name}
                  className="p-3 rounded-xl border border-[#1E293B] bg-[#0A0D14] flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-xs text-[#F8FAFC]">
                      {tpl.title}{' '}
                      <span className="font-mono text-[10px] text-[#00D2FF]">
                        ({tpl.name})
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
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
                    className="px-3 py-1.5 rounded-lg bg-[#0072FF] hover:bg-[#00D2FF] hover:text-[#0A0D14] text-[#F8FAFC] text-xs font-bold shrink-0 transition"
                  >
                    Disparar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Resposta em Comentário de Post/Reels do Instagram + Direct (Comment-to-DM) */}
      {showIgCommentModal && currentContact && (
        <div className="fixed inset-0 bg-[#0A0D14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
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
            className="bg-[#121824] border border-[#1E293B] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-950/60 text-pink-300 text-[10px] font-bold mb-1 border border-pink-500/30">
                  📸 Instagram Graph API v21.0 • Comment-to-DM
                </span>
                <h3 className="font-bold text-base text-[#F8FAFC]">
                  Responder Comentário no Post + Puxar para o Direct
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIgCommentModal(false)}
                className="text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Responda publicamente abaixo do comentário de{' '}
              <strong className="text-[#F8FAFC]">{currentContact.name}</strong> na publicação/Reels e
              envie simultaneamente uma mensagem privada no Instagram Direct.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#F8FAFC] mb-1">
                1. Resposta Pública no Comentário do Post (Opcional)
              </label>
              <textarea
                rows={2}
                value={igPublicReply}
                onChange={(e) => setIgPublicReply(e.target.value)}
                placeholder="Ex: Olá! Te enviamos todos os detalhes e valores no seu Direct agora mesmo! 🚀📩"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
              <span className="text-[10px] text-[#94A3B8]">
                Aparecerá publicamente abaixo do comentário do cliente no Post/Reels (`POST /{'{comment_id}'}/replies`).
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#F8FAFC] mb-1">
                2. Mensagem Privada no Direct — Comment-to-DM (Opcional)
              </label>
              <textarea
                rows={3}
                value={igPrivateDm}
                onChange={(e) => setIgPrivateDm(e.target.value)}
                placeholder="Ex: Olá! Vi seu comentário no nosso post 😊 Aqui estão as condições especiais..."
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
              <span className="text-[10px] text-[#94A3B8]">
                Abre a conversa no Direct vinculada ao comentário (`recipient.comment_id`).
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowIgCommentModal(false)}
                className="px-4 py-2 rounded-xl border border-[#1E293B] text-xs font-semibold text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#F8FAFC] transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  igSending || (!igPublicReply.trim() && !igPrivateDm.trim())
                }
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-[#6366F1] hover:opacity-90 text-white text-xs font-bold disabled:opacity-40 transition"
              >
                {igSending
                  ? 'Enviando...'
                  : '🚀 Responder no Post + Enviar Direct'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

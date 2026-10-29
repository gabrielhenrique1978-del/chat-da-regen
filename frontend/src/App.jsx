import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import OmnichannelInbox from './components/OmnichannelInbox';
import SellersView from './components/SellersView';
import KanbanView from './components/KanbanView';
import ConnectionsView from './components/ConnectionsView';
import SettingsView from './components/SettingsView';
import { api, createRealtimeSocket } from './lib/api';
import {
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  ShieldAlert,
  Eye,
  Lock,
  KeyRound,
  LogOut,
  Crown,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('ocf_theme');
    return saved ? saved === 'dark' : true;
  });

  // Global Data States
  const [stats, setStats] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [activeSeller, setActiveSeller] = useState(() => {
    try {
      const saved = localStorage.getItem('ocf_active_seller');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Supervisor Mode vs Locked Seller Session + Impersonation ("Entrar na Conta")
  const [isSupervisorMode, setIsSupervisorMode] = useState(() => {
    const saved = localStorage.getItem('ocf_supervisor_mode');
    return saved ? saved === 'true' : true;
  });
  const [impersonatedSeller, setImpersonatedSeller] = useState(null);

  // PIN Login / Operator Switch Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinSellerId, setPinSellerId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const selectedContactIdRef = useRef(null);
  const [contactDetail, setContactDetail] = useState(null);
  const [stages, setStages] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [authUser, setAuthUser] = useState({
    role: 'super_admin',
    is_super_admin: true,
    name: 'Gabriel Henrique / Otavio Santana (Super Admin)',
    email: 'root@openchatfunnel.io',
    tenant_id: 'master',
  });
  const [suspendedDetail, setSuspendedDetail] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSellersModal, setShowSellersModal] = useState(false);

  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  // Sync Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('ocf_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ocf_theme', 'light');
    }
  }, [darkMode]);

  // Persist Supervisor Mode
  useEffect(() => {
    localStorage.setItem('ocf_supervisor_mode', String(isSupervisorMode));
  }, [isSupervisorMode]);

  // Load Active Sellers for Selectors
  const loadSellers = useCallback(async () => {
    try {
      const res = await api.getSellers(false);
      const list = res.sellers || [];
      setSellers(list);
      setActiveSeller((prev) => {
        if (prev) {
          const found = list.find(
            (s) => String(s.id) === String(prev.id) && s.active
          );
          if (found) return found;
        }
        return list[0] || null;
      });
      setImpersonatedSeller((prev) => {
        if (!prev) return null;
        return list.find((s) => String(s.id) === String(prev.id)) || null;
      });
    } catch (err) {
      if (err.status === 403) setSuspendedDetail(err.detail);
      console.error('Erro ao carregar vendedores:', err);
    }
  }, []);

  // Load Contacts
  const loadContacts = useCallback(async () => {
    try {
      const list = await api.getContacts();
      setContacts(Array.isArray(list) ? list : []);
    } catch (err) {
      if (err.status === 403) setSuspendedDetail(err.detail);
      console.error('Erro ao carregar contatos:', err);
    }
  }, []);

  // Load Stats, Funnel Stages & Quick Replies
  const loadAuxiliary = useCallback(async () => {
    try {
      const [stData, kanbanData, qrData] = await Promise.all([
        api.getStats().catch(() => null),
        api.getKanban().catch(() => null),
        api.getQuickReplies().catch(() => []),
      ]);
      if (stData) setStats(stData);
      if (kanbanData?.stages) setStages(kanbanData.stages);
      setQuickReplies(Array.isArray(qrData) ? qrData : []);
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err);
    }
  }, []);

  // Load Selected Contact Detail + 24h Meta Window
  const loadContactDetail = useCallback(async (contactId) => {
    if (!contactId) {
      setContactDetail(null);
      setWindowInfo(null);
      return;
    }
    try {
      const detail = await api.getContactDetail(contactId);
      setContactDetail(detail);
      api
        .getContact24hWindow(contactId)
        .then((win) => setWindowInfo(win))
        .catch(() => setWindowInfo(null));
    } catch (err) {
      if (err.status === 403) setSuspendedDetail(err.detail);
      console.error('Erro ao carregar detalhes do contato:', err);
    }
  }, []);

  // Initial Bootstrap
  useEffect(() => {
    loadSellers();
    loadContacts();
    loadAuxiliary();
  }, [loadSellers, loadContacts, loadAuxiliary]);

  // Select first contact automatically when contacts load if none selected
  useEffect(() => {
    if (!selectedContactId && contacts.length > 0) {
      setSelectedContactId(contacts[0].id);
    }
  }, [contacts, selectedContactId]);

  useEffect(() => {
    if (selectedContactId) {
      loadContactDetail(selectedContactId);
    }
  }, [selectedContactId, loadContactDetail]);

  // WebSocket Real-time Connection (Stable lifecycle)
  useEffect(() => {
    const cleanupSocket = createRealtimeSocket((payload) => {
      if (!payload || !payload.event) return;
      const ev = payload.event;
      if (ev === 'ws_connected') {
        setWsConnected(true);
        return;
      }
      if (ev === 'ws_disconnected') {
        setWsConnected(false);
        return;
      }
      if (
        ev === 'new_message' ||
        ev === 'seller_assigned' ||
        ev === 'contact_assigned' ||
        ev === 'handoff_updated' ||
        ev === 'human_handoff' ||
        ev === 'stage_changed' ||
        ev === 'meta_message_status'
      ) {
        loadContacts();
        if (selectedContactIdRef.current) {
          loadContactDetail(selectedContactIdRef.current);
        }
      }
      if (
        ev === 'sellers_updated' ||
        ev === 'seller_created' ||
        ev === 'seller_updated'
      ) {
        loadSellers();
        loadContacts();
      }
    });
    return () => {
      if (typeof cleanupSocket === 'function') {
        cleanupSocket();
      }
    };
  }, [loadContacts, loadContactDetail, loadSellers]);

  // Supervisor: Impersonate Seller ("Entrar na Conta do Vendedor")
  const handleImpersonateSeller = useCallback(
    async (seller, jumpToInbox = false) => {
      if (!seller) return;
      try {
        await api.impersonateSeller(seller.id, 'Supervisor');
      } catch {
        // fallback local
      }
      setIsSupervisorMode(true);
      setImpersonatedSeller(seller);
      setActiveSeller(seller);
      localStorage.setItem('ocf_active_seller', JSON.stringify(seller));
      showToast(
        `👁️ Modo Supervisor: Você entrou na conta de ${seller.name}`,
        'success'
      );
      if (jumpToInbox) {
        setShowSellersModal(false);
        setActiveTab('inbox');
      }
    },
    [showToast]
  );

  const handleExitImpersonation = useCallback(async () => {
    try {
      await api.impersonateSeller(null, 'Supervisor');
    } catch {
      // ignore
    }
    setImpersonatedSeller(null);
    showToast('👑 Retornou para a Visão Global de Supervisor');
  }, [showToast]);

  // Lock Session Exclusively to a Single Seller ("Garantir que cada vendedor use só seu nome")
  const handleLockToSeller = useCallback(
    (seller) => {
      if (!seller) return;
      setActiveSeller(seller);
      setImpersonatedSeller(null);
      setIsSupervisorMode(seller.role === 'supervisor');
      localStorage.setItem('ocf_active_seller', JSON.stringify(seller));
      localStorage.setItem(
        'ocf_supervisor_mode',
        String(seller.role === 'supervisor')
      );
      showToast(
        seller.role === 'supervisor'
          ? `👑 Sessão de Supervisor ativada: ${seller.name}`
          : `🔒 Sessão travada exclusivamente no vendedor: ${seller.name}`
      );
    },
    [showToast]
  );

  // Authenticate via PIN Modal (Validated in Backend + Audit Log)
  const handleAuthenticatePin = async (e) => {
    e.preventDefault();
    setPinError('');
    if (!pinSellerId) {
      setPinError('Selecione o colaborador.');
      return;
    }

    try {
      const res = await api.authenticateSeller(pinSellerId, pinInput.trim());
      if (res.authenticated) {
        if (pinSellerId === '__SUPERVISOR_MASTER__') {
          setIsSupervisorMode(true);
          setImpersonatedSeller(null);
          localStorage.setItem('ocf_supervisor_mode', 'true');
          setShowPinModal(false);
          setPinInput('');
          showToast('👑 Modo Supervisor Global desbloqueado com sucesso!');
          return;
        }
        if (res.seller) {
          handleLockToSeller(res.seller);
          setShowPinModal(false);
          setPinInput('');
        }
      }
    } catch (err) {
      setPinError(err.message || 'PIN incorreto para este colaborador.');
    }
  };

  // Action Handlers for OmnichannelInbox & ContactDrawer
  const handleSendMessage = async (payload) => {
    try {
      await api.sendMessage(payload);
      await Promise.all([
        loadContactDetail(payload.contact_id),
        loadContacts(),
      ]);
    } catch (err) {
      if (err.status === 403) setSuspendedDetail(err.detail);
      showToast(err.message || 'Erro ao enviar mensagem', 'error');
    }
  };

  const handleSendAudio = async (payload) => {
    try {
      await api.sendWhatsAppAudio(payload);
      showToast('🎙️ Nota de voz enviada com sucesso!');
      await Promise.all([
        loadContactDetail(payload.contact_id),
        loadContacts(),
      ]);
    } catch (err) {
      showToast(err.message || 'Erro ao enviar nota de voz', 'error');
    }
  };

  const handleRoundRobinAssign = async (operatorName) => {
    try {
      const res = await api.assignRoundRobinWaiting(operatorName);
      showToast(
        `🎰 Roleta executada: ${res.distributed_count || 0} cliente(s) distribuído(s)!`
      );
      await loadContacts();
      if (selectedContactId) {
        await loadContactDetail(selectedContactId);
      }
    } catch (err) {
      showToast(err.message || 'Erro na roleta automática', 'error');
    }
  };

  const handleExportLgpd = async (contactId) => {
    try {
      const actor = activeSeller?.name || 'Supervisor';
      const dossier = await api.exportContactLgpd(contactId, actor);
      const blob = new Blob([JSON.stringify(dossier, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dossie-lgpd-${contactId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('🛡️ Dossiê LGPD (Art. 18) exportado e registrado na auditoria!');
    } catch (err) {
      showToast(err.message || 'Erro ao exportar dossiê LGPD', 'error');
    }
  };

  const handleAnonymizeLgpd = async (contactId) => {
    try {
      const actor = activeSeller?.name || 'Supervisor';
      await api.anonymizeContactLgpd(contactId, actor);
      showToast(
        '🛡️ Titular anonimizado permanentemente (Direito ao Esquecimento LGPD)!'
      );
      await Promise.all([loadContactDetail(contactId), loadContacts()]);
    } catch (err) {
      showToast(err.message || 'Erro ao anonimizar contato', 'error');
    }
  };

  const handleToggleConsent = async (contactId, consentStatus) => {
    try {
      const actor = activeSeller?.name || 'Operador';
      await api.updateContactConsent(contactId, consentStatus, actor);
      showToast(
        consentStatus === 'opted_out'
          ? '🛡️ Opt-Out LGPD ativado: cliente bloqueado para campanhas.'
          : '🛡️ Consentimento LGPD reativado (Opt-In).'
      );
      await Promise.all([loadContactDetail(contactId), loadContacts()]);
    } catch (err) {
      showToast(err.message || 'Erro ao atualizar consentimento LGPD', 'error');
    }
  };

  const handleSendTemplate = async (payload) => {
    try {
      await api.sendTemplate(payload);
      showToast('Template Oficial da Meta disparado com sucesso!');
      await Promise.all([
        loadContactDetail(payload.contact_id),
        loadContacts(),
      ]);
    } catch (err) {
      showToast(err.message || 'Erro ao disparar template', 'error');
    }
  };

  const handleSendSimulated = async (payload) => {
    try {
      await api.sendIncomingSimulated(payload);
      showToast('Mensagem inbound simulada com sucesso!');
      await Promise.all([
        loadContactDetail(payload.contact_id),
        loadContacts(),
      ]);
    } catch (err) {
      showToast(err.message || 'Erro ao simular mensagem', 'error');
    }
  };

  const handleReplyInstagramComment = async (payload) => {
    try {
      await api.replyInstagramComment(payload);
      showToast(
        '📸 Resposta enviada no Comentário do Post + Direct (Comment-to-DM)!'
      );
      await Promise.all([
        loadContactDetail(payload.contact_id),
        loadContacts(),
      ]);
    } catch (err) {
      showToast(
        err.message || 'Erro ao responder comentário do Instagram',
        'error'
      );
    }
  };

  const handleAssignContact = async (contactId, payload) => {
    try {
      await api.assignContact(contactId, payload);
      showToast(`Responsável atualizado: ${payload.assignee}`);
      await Promise.all([loadContactDetail(contactId), loadContacts()]);
    } catch (err) {
      showToast(err.message || 'Erro ao atribuir vendedor', 'error');
    }
  };

  const handleChangeTemperature = async (contactId, temperature) => {
    const scoreMap = { hot: 90, warm: 60, cold: 25 };
    try {
      await api.updateContactTemperature(
        contactId,
        temperature,
        scoreMap[temperature] || 60
      );
      showToast(`Temperatura alterada para ${temperature.toUpperCase()}`);
      await Promise.all([loadContactDetail(contactId), loadContacts()]);
    } catch (err) {
      showToast(err.message || 'Erro ao alterar temperatura', 'error');
    }
  };

  const handleAddTag = async (contactId, tag) => {
    try {
      await api.addContactTag(contactId, tag);
      showToast(`Tag #${tag} adicionada`);
      await Promise.all([loadContactDetail(contactId), loadContacts()]);
    } catch (err) {
      showToast(err.message || 'Erro ao adicionar tag', 'error');
    }
  };

  const handleMoveStage = async (dealId, stageId) => {
    try {
      await api.moveDealStage(dealId, stageId);
      showToast('Etapa do funil atualizada!');
      await Promise.all([
        loadContactDetail(selectedContactId),
        loadAuxiliary(),
      ]);
    } catch (err) {
      showToast(err.message || 'Erro ao mover etapa do funil', 'error');
    }
  };

  // Switch Super Admin / Tenant Identity
  const handleSwitchAuthRole = async (targetRole) => {
    const normalizedRole =
      targetRole === 'superadmin' || targetRole === 'super_admin'
        ? 'super_admin'
        : 'tenant';
    try {
      const res = await api.quickSwitchProfile(normalizedRole);
      if (res.access_token) {
        localStorage.setItem('openchatfunnel_auth_token', res.access_token);
      }
      if (res.user) {
        setAuthUser(res.user);
      }
      setSuspendedDetail(null);
      showToast(
        normalizedRole === 'super_admin'
          ? 'Perfil ativado: ROOT SUPER ADMIN (Proprietário)'
          : 'Perfil ativado: TENANT CLIENTE'
      );
    } catch (err) {
      if (err.status === 403) {
        setSuspendedDetail(err.detail);
      }
      showToast(err.message || 'Falha ao alternar perfil', 'error');
    }
  };

  const isSuperAdmin =
    authUser?.role === 'super_admin' || authUser?.is_super_admin;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0D14] text-[#F8FAFC] select-none">
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        sellers={sellers}
        activeSeller={activeSeller}
        isSupervisorMode={isSupervisorMode}
        impersonatedSeller={impersonatedSeller}
        onImpersonateSeller={(s) => handleImpersonateSeller(s, true)}
        onExitImpersonation={handleExitImpersonation}
        onOpenPinModal={() => {
          setPinSellerId(activeSeller?.id || sellers[0]?.id || '');
          setPinError('');
          setPinInput('');
          setShowPinModal(true);
        }}
        authUser={authUser}
        onOpenAuthModal={() => setActiveTab('settings')}
        wsConnected={wsConnected}
        stats={stats}
      />

      {/* Main Content Area (Alinhado topo a topo com a Sidebar, sem barras duplicadas) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <main className="flex-1 flex h-full w-full overflow-hidden relative">
          {activeTab === 'inbox' && (
            <OmnichannelInbox
              contacts={contacts}
              selectedContactId={selectedContactId}
              onSelectContact={setSelectedContactId}
              contactDetail={contactDetail}
              sellers={sellers}
              activeSeller={activeSeller}
              isSupervisorMode={isSupervisorMode}
              impersonatedSeller={impersonatedSeller}
              onImpersonateSeller={(s) => handleImpersonateSeller(s, false)}
              onExitImpersonation={handleExitImpersonation}
              stages={stages}
              quickReplies={quickReplies}
              windowInfo={windowInfo}
              onSendMessage={handleSendMessage}
              onSendAudio={handleSendAudio}
              onSendTemplate={handleSendTemplate}
              onSendSimulated={handleSendSimulated}
              onReplyInstagramComment={handleReplyInstagramComment}
              onAssignContact={handleAssignContact}
              onRoundRobinAssign={handleRoundRobinAssign}
              onChangeTemperature={handleChangeTemperature}
              onAddTag={handleAddTag}
              onMoveStage={handleMoveStage}
              onExportLgpd={handleExportLgpd}
              onAnonymizeLgpd={handleAnonymizeLgpd}
              onToggleConsent={handleToggleConsent}
              onOpenSellersModal={() => setShowSellersModal(true)}
            />
          )}

          {activeTab === 'kanban' && (
            <KanbanView
              onOpenContactInInbox={(contactId) => {
                setSelectedContactId(contactId);
                setActiveTab('inbox');
              }}
            />
          )}

          {activeTab === 'sellers' && (
            <SellersView
              contacts={contacts}
              activeSeller={activeSeller}
              isSupervisorMode={isSupervisorMode}
              impersonatedSeller={impersonatedSeller}
              onImpersonateSeller={handleImpersonateSeller}
              onLockToSeller={handleLockToSeller}
              onOpenPinModal={() => {
                setPinSellerId('__SUPERVISOR_MASTER__');
                setPinError('');
                setPinInput('');
                setShowPinModal(true);
              }}
              onSellersUpdated={() => {
                loadSellers();
                loadContacts();
                if (selectedContactId) loadContactDetail(selectedContactId);
              }}
            />
          )}

          {activeTab === 'connections' && (
            <ConnectionsView
              onWebhookSimulated={() => {
                loadContacts();
                if (selectedContactId) loadContactDetail(selectedContactId);
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              authUser={authUser}
              onSwitchAuthRole={handleSwitchAuthRole}
            />
          )}
        </main>
      </div>

      {/* Modal de Autenticação por PIN Individual (Vendedor Travado vs Supervisor) */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-[#0A0D14]/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={handleAuthenticatePin}
            className="bg-[#121824] border border-[#00D2FF]/25 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-neon"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00D2FF]/15 text-[#00D2FF] border border-[#00D2FF]/30 shadow-neon flex items-center justify-center">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                    Identidade do Operador & PIN
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    Garante que cada vendedor opere apenas no próprio nome
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                <X size={18} />
              </button>
            </div>

            {pinError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs font-semibold text-rose-300">
                {pinError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                  Selecionar Perfil / Conta
                </label>
                <select
                  value={pinSellerId}
                  onChange={(e) => setPinSellerId(e.target.value)}
                  className="w-full rounded-xl border border-[#00D2FF]/25 bg-[#0A0D14] px-3.5 py-2.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
                >
                  <option value="__SUPERVISOR_MASTER__">
                    👑 MODO SUPERVISOR GLOBAL (Acessar todas as contas)
                  </option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      🔒 Vendedor Travado: {s.name} (
                      {s.role === 'supervisor' ? 'Supervisor' : 'Vendedor'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                  PIN de Acesso Individual (Padrão: 1234)
                </label>
                <input
                  type="password"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Digite seu PIN (ex: 1234)"
                  className="w-full rounded-xl border border-[#00D2FF]/25 bg-[#0A0D14] px-3.5 py-2.5 text-xs font-mono font-bold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="px-4 py-2 rounded-xl border border-[#00D2FF]/20 text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00D2FF] to-[#0072FF] hover:from-[#38BDF8] hover:to-[#00D2FF] text-[#0A0D14] shadow-neon text-xs font-extrabold transition"
              >
                Confirmar e Travar Sessão
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Sellers Management Modal */}
      {showSellersModal && (
        <div className="fixed inset-0 z-50 bg-[#0A0D14]/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#121824] border border-[#00D2FF]/25 rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-neon overflow-hidden">
            <div className="px-6 py-4 border-b border-[#00D2FF]/15 flex items-center justify-between bg-[#0A0D14]/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00D2FF]/15 text-[#00D2FF] border border-[#00D2FF]/30 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F8FAFC]">
                    Gestão de Vendedores, PIN Individual & Espelhamento de Contas
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    Cadastre vendedores, defina o PIN individual ou clique em "Entrar na Conta" como Supervisor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSellersModal(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#00D2FF] hover:bg-[#1B2333] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SellersView
                contacts={contacts}
                activeSeller={activeSeller}
                isSupervisorMode={isSupervisorMode}
                impersonatedSeller={impersonatedSeller}
                onImpersonateSeller={handleImpersonateSeller}
                onLockToSeller={(s) => {
                  handleLockToSeller(s);
                  setShowSellersModal(false);
                }}
                onOpenPinModal={() => {
                  setShowSellersModal(false);
                  setPinSellerId('__SUPERVISOR_MASTER__');
                  setPinError('');
                  setPinInput('');
                  setShowPinModal(true);
                }}
                onSellersUpdated={() => {
                  loadSellers();
                  loadContacts();
                  if (selectedContactId) loadContactDetail(selectedContactId);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Suspended Tenant Overlay (HTTP 403 Lockout) */}
      {suspendedDetail && (
        <div className="fixed inset-0 z-50 bg-[#0A0D14]/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-[#F8FAFC]">
              Acesso da Empresa Suspenso (HTTP 403)
            </h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {suspendedDetail}
            </p>
            <div className="pt-2">
              <button
                onClick={() => handleSwitchAuthRole('super_admin')}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00D2FF] to-[#0072FF] text-[#0A0D14] shadow-neon text-xs font-extrabold transition"
              >
                Voltar para Identidade Super Admin (Proprietário)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-neon border text-xs font-semibold animate-fade-in bg-[#121824] text-[#F8FAFC] border-[#00D2FF]/30">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#00D2FF] shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

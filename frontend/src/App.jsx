import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import OmnichannelInbox from './components/OmnichannelInbox';
import SellersView from './components/SellersView';
import KanbanView from './components/KanbanView';
import ConnectionsView from './components/ConnectionsView';
import SettingsView from './components/SettingsView';
import { api, createRealtimeSocket } from './lib/api';
import { CheckCircle2, AlertCircle, X, Users, ShieldAlert } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('ocf_theme');
    return saved ? saved === 'dark' : false;
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

  // Persist active seller
  const handleSelectSeller = useCallback(
    (seller) => {
      setActiveSeller(seller);
      if (seller) {
        localStorage.setItem('ocf_active_seller', JSON.stringify(seller));
        showToast(`Operando como: ${seller.name}`, 'info');
      } else {
        localStorage.removeItem('ocf_active_seller');
      }
    },
    [showToast]
  );

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
        ev === 'human_handoff' ||
        ev === 'stage_changed' ||
        ev === 'meta_message_status'
      ) {
        loadContacts();
        if (selectedContactIdRef.current) {
          loadContactDetail(selectedContactIdRef.current);
        }
      }
      if (ev === 'sellers_updated') {
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
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
        onSelectSeller={handleSelectSeller}
        authUser={authUser}
        onOpenAuthModal={() => setActiveTab('settings')}
        wsConnected={wsConnected}
        stats={stats}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Sub-bar with Quick Identity Badge & Seller Quick Modal Trigger */}
        <header className="h-11 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              OpenChatFunnel SaaS
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              PostgreSQL Neon Cloud + Meta Graph API v21.0
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Modal Trigger for Seller Management from anywhere */}
            <button
              onClick={() => setShowSellersModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200/70 dark:border-slate-700/70 transition"
              title="Abrir Gestão Rápida de Vendedores"
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Equipe ({sellers.length} ativos)</span>
            </button>

            {/* Role Switcher Pill */}
            <button
              onClick={() =>
                handleSwitchAuthRole(isSuperAdmin ? 'tenant' : 'super_admin')
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                isSuperAdmin
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-400'
              }`}
              title="Clique para alternar entre Super Admin (Dono do SaaS) e Tenant (Cliente)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {isSuperAdmin ? 'ROOT SUPER ADMIN' : 'TENANT CLIENTE'}
            </button>
          </div>
        </header>

        {/* Active View Body */}
        <main className="flex-1 flex overflow-hidden relative">
          {activeTab === 'inbox' && (
            <OmnichannelInbox
              contacts={contacts}
              selectedContactId={selectedContactId}
              onSelectContact={setSelectedContactId}
              contactDetail={contactDetail}
              sellers={sellers}
              activeSeller={activeSeller}
              stages={stages}
              quickReplies={quickReplies}
              windowInfo={windowInfo}
              onSendMessage={handleSendMessage}
              onSendTemplate={handleSendTemplate}
              onSendSimulated={handleSendSimulated}
              onAssignContact={handleAssignContact}
              onChangeTemperature={handleChangeTemperature}
              onAddTag={handleAddTag}
              onMoveStage={handleMoveStage}
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

      {/* Quick Sellers Management Modal */}
      {showSellersModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Gestão Rápida de Vendedores (Equipa Dinâmica)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cadastre, edite ou desative vendedores (Soft Delete) com atualização imediata nos seletores
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSellersModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SellersView
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
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Acesso da Empresa Suspenso (HTTP 403)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {suspendedDetail}
            </p>
            <div className="pt-2">
              <button
                onClick={() => handleSwitchAuthRole('super_admin')}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
              >
                Voltar para Identidade Super Admin (Proprietário)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-xs font-medium animate-fade-in bg-slate-900 text-white border-slate-700 dark:bg-slate-800 dark:border-slate-700">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
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
    return saved ? saved === 'dark' : true;
  });

  // Global Data States
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
  const [contactDetail, setContactDetail] = useState(null);
  const [stages, setStages] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [authUser, setAuthUser] = useState({
    role: 'superadmin',
    name: 'Gabriel Henrique / Otavio Santana (Super Admin)',
    email: 'root@openchatfunnel.io',
    tenant_id: 1,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSellersModal, setShowSellersModal] = useState(false);

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
  const handleSelectActiveSeller = (seller) => {
    setActiveSeller(seller);
    if (seller) {
      localStorage.setItem('ocf_active_seller', JSON.stringify(seller));
      showToast(`Modo operador: ${seller.name}`, 'info');
    } else {
      localStorage.removeItem('ocf_active_seller');
      showToast('Modo Visão Geral (Supervisor)', 'info');
    }
  };

  // Load Sellers (including inactive for management view)
  const loadSellers = useCallback(async () => {
    try {
      const res = await api.getSellers(true);
      const list = res.sellers || [];
      setSellers(list);
      // Keep activeSeller synced with fresh DB state
      setActiveSeller((prev) => {
        if (!prev) return null;
        const found = list.find((s) => Number(s.id) === Number(prev.id) && s.active);
        return found || null;
      });
    } catch (err) {
      console.error('Erro ao carregar vendedores:', err);
    }
  }, []);

  // Load Contacts
  const loadContacts = useCallback(async () => {
    try {
      const list = await api.getContacts();
      setContacts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Erro ao carregar contatos:', err);
    }
  }, []);

  // Load Funnel Stages & Quick Replies
  const loadAuxiliary = useCallback(async () => {
    try {
      const [st, qr] = await Promise.all([
        api.getStages().catch(() => []),
        api.getQuickReplies().catch(() => []),
      ]);
      setStages(Array.isArray(st) ? st : []);
      setQuickReplies(Array.isArray(qr) ? qr : []);
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
      // Also check Meta 24h window status
      api
        .getMetaWindowStatus(contactId)
        .then((win) => setWindowInfo(win))
        .catch(() => setWindowInfo(null));
    } catch (err) {
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

  // WebSocket Real-time Connection
  useEffect(() => {
    const socket = createRealtimeSocket(
      (payload) => {
        if (!payload || !payload.event) return;
        const ev = payload.event;
        if (
          ev === 'new_message' ||
          ev === 'seller_assigned' ||
          ev === 'human_handoff' ||
          ev === 'stage_changed' ||
          ev === 'meta_message_status'
        ) {
          loadContacts();
          if (selectedContactId) {
            loadContactDetail(selectedContactId);
          }
        }
        if (ev === 'sellers_updated') {
          loadSellers();
          loadContacts();
        }
      },
      (connected) => setWsConnected(connected)
    );
    return () => socket.close();
  }, [loadContacts, loadContactDetail, loadSellers, selectedContactId]);

  // Switch Super Admin / Tenant Identity
  const handleQuickSwitchRole = async (targetRole) => {
    try {
      const res = await api.quickSwitchRole(targetRole);
      if (res.token) {
        localStorage.setItem('ocf_jwt_token', res.token);
      }
      if (res.user) {
        setAuthUser(res.user);
      }
      showToast(
        targetRole === 'superadmin'
          ? 'Identidade alterada: ROOT SUPER ADMIN ativado'
          : 'Identidade alterada: TENANT ADMIN (Cliente)',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Falha ao alternar perfil', 'error');
    }
  };

  const unreadCount = contacts.filter((c) => !c.seller_id).length;

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
        onSelectActiveSeller={handleSelectActiveSeller}
        authUser={authUser}
        onQuickSwitchRole={handleQuickSwitchRole}
        wsConnected={wsConnected}
        unreadCount={unreadCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Sub-bar with Quick Identity Badge & Seller Quick Modal Trigger */}
        <header className="h-11 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-brand-950/50 text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-200/70 dark:border-slate-700/70 transition"
              title="Abrir Gestão Rápida de Vendedores"
            >
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span>Equipe ({sellers.filter((s) => s.active).length} ativos)</span>
            </button>

            {/* Role Switcher Pill */}
            <button
              onClick={() =>
                handleQuickSwitchRole(authUser?.role === 'superadmin' ? 'admin' : 'superadmin')
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                authUser?.role === 'superadmin'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
              }`}
              title="Clique para alternar entre Super Admin (Dono do SaaS) e Tenant (Cliente)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {authUser?.role === 'superadmin' ? 'ROOT SUPER ADMIN' : 'TENANT CLIENTE #1'}
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
              onRefreshContacts={loadContacts}
              onRefreshDetail={() => loadContactDetail(selectedContactId)}
              onOpenSellersModal={() => setShowSellersModal(true)}
              showToast={showToast}
            />
          )}

          {activeTab === 'kanban' && (
            <KanbanView
              contacts={contacts}
              stages={stages}
              sellers={sellers}
              onRefresh={() => {
                loadContacts();
                loadAuxiliary();
              }}
              onOpenContactInInbox={(contactId) => {
                setSelectedContactId(contactId);
                setActiveTab('inbox');
              }}
              showToast={showToast}
            />
          )}

          {activeTab === 'sellers' && (
            <SellersView
              sellers={sellers}
              contacts={contacts}
              onRefresh={() => {
                loadSellers();
                loadContacts();
              }}
              showToast={showToast}
            />
          )}

          {activeTab === 'connections' && <ConnectionsView showToast={showToast} />}

          {activeTab === 'settings' && (
            <SettingsView
              authUser={authUser}
              onQuickSwitchRole={handleQuickSwitchRole}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Quick Sellers Management Modal (accessible directly from the Chat / Topbar) */}
      {showSellersModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center">
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
                sellers={sellers}
                contacts={contacts}
                onRefresh={() => {
                  loadSellers();
                  loadContacts();
                  if (selectedContactId) loadContactDetail(selectedContactId);
                }}
                showToast={showToast}
              />
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

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
import { Modal, Button, Field, fieldClass, IconButton } from './components/ui';

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
    email: 'root@regenflow.io',
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
        localStorage.setItem('regenflow_auth_token', res.access_token);
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

      {/* Modal de Autenticação por PIN Individual */}
      {showPinModal && (
        <Modal
          title="Identidade do operador e PIN"
          description="Selecione sua conta individual para operar em seu próprio nome ou entre como supervisor."
          onClose={() => setShowPinModal(false)}
          as="form"
          onSubmit={handleAuthenticatePin}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPinModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Confirmar e travar sessão
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {pinError && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-accent/30 bg-accent-deep/20 text-xs text-fg flex items-center gap-2"
              >
                <AlertCircle size={14} className="text-accent shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <Field label="Selecionar conta / perfil">
              <select
                value={pinSellerId}
                onChange={(e) => setPinSellerId(e.target.value)}
                className={fieldClass}
              >
                <option value="__SUPERVISOR_MASTER__">
                  Modo Supervisor Global (todas as contas)
                </option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role === 'supervisor' ? 'Supervisor' : 'Vendedor'})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="PIN de acesso (Padrão: 1234)"
              hint="Código numérico de 4 a 8 dígitos."
            >
              <input
                type="password"
                autoFocus
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Ex: 1234"
                className={cn(fieldClass, 'font-mono tracking-widest')}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Modal de Gestão Rápida de Equipe */}
      {showSellersModal && (
        <Modal
          title="Gestão de vendedores e supervisão"
          description="Cadastre membros, altere o PIN individual ou entre na conta de um operador."
          onClose={() => setShowSellersModal(false)}
          size="xl"
        >
          <div className="-m-5">
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
        </Modal>
      )}

      {/* Bloqueio de Acesso por Suspensão de Tenant (HTTP 403) */}
      {suspendedDetail && (
        <div className="fixed inset-0 z-50 bg-canvas/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-accent/40 rounded-xl max-w-md w-full p-6 text-center space-y-4 shadow-card">
            <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center mx-auto text-accent">
              <ShieldAlert size={20} />
            </div>
            <h3 className="text-sm font-semibold text-fg">
              Acesso da empresa suspenso
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              {suspendedDetail}
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => handleSwitchAuthRole('super_admin')}
              >
                Voltar para perfil Super Admin (Proprietário)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notificação Toast Global */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-line-strong bg-surface text-xs font-medium text-fg shadow-card animate-fade-in"
        >
          {toast.type === 'error' ? (
            <AlertCircle size={15} className="text-accent shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="text-primary shrink-0" />
          )}
          <span>{toast.message}</span>
          <IconButton
            label="Fechar notificação"
            size="sm"
            onClick={() => setToast(null)}
            className="-mr-1.5"
          >
            <X size={13} />
          </IconButton>
        </aside>
      )}
    </div>
  );
}

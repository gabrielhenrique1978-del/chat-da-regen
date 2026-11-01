/**
 * Cliente HTTP & WebSocket unificado para comunicação com o Backend Python (FastAPI + Neon PostgreSQL)
 * Desenvolvido por Gabriel Henrique e Otavio Santana
 */

const API_BASE = '/api';

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('regenflow_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error = new Error((data && data.detail) || `Erro HTTP ${response.status}`);
    error.status = response.status;
    error.detail = (data && data.detail) || data;
    throw error;
  }

  return data;
}

export const api = {
  // Estatísticas e Saúde
  getStats: () => apiRequest('/stats'),
  getSecurityStatus: () => apiRequest('/security/status'),
  runSecurityAudit: () => apiRequest('/security/re-encrypt', { method: 'POST' }),
  getAuditLogs: (limit = 100) => apiRequest(`/security/audit-logs?limit=${limit}`),

  // Contatos e Atendimento Omnichannel
  getContacts: (channel = '') =>
    apiRequest(`/contacts${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`),
  getContactDetail: (contactId) => apiRequest(`/contacts/${contactId}`),
  exportContactLgpd: (contactId, actor = 'Supervisor') =>
    apiRequest(`/contacts/${contactId}/lgpd-export?actor=${encodeURIComponent(actor)}`),
  anonymizeContactLgpd: (contactId, actor = 'Supervisor') =>
    apiRequest(`/contacts/${contactId}/lgpd-anonymize?actor=${encodeURIComponent(actor)}`, {
      method: 'POST',
    }),
  updateContactConsent: (contactId, consentStatus, actor = 'Operador') =>
    apiRequest(
      `/contacts/${contactId}/consent?consent_status=${encodeURIComponent(
        consentStatus
      )}&actor=${encodeURIComponent(actor)}`,
      { method: 'PATCH' }
    ),
  assignRoundRobinWaiting: (operatorName = 'Supervisor') =>
    apiRequest(
      `/contacts/round-robin/assign-next?operator_name=${encodeURIComponent(operatorName)}`,
      { method: 'POST' }
    ),
  assignContact: (contactId, payload) =>
    apiRequest(`/contacts/${contactId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateContactTemperature: (contactId, temperature, lead_score) =>
    apiRequest(`/contacts/${contactId}/temperature`, {
      method: 'PATCH',
      body: JSON.stringify({ temperature, lead_score }),
    }),
  addContactTag: (contactId, tag) =>
    apiRequest(`/contacts/${contactId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),
  getContact24hWindow: (contactId) => apiRequest(`/contacts/${contactId}/window`),
  clearDemoContacts: () => apiRequest('/contacts/clear-demo', { method: 'POST' }),

  // Mensagens, Áudio PTT, Templates HSM e Simulador
  sendMessage: (payload) =>
    apiRequest('/messages/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendWhatsAppAudio: (payload) =>
    apiRequest('/whatsapp/send-audio', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendTemplate: (payload) =>
    apiRequest('/messages/send-template', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendIncomingSimulated: (payload) =>
    apiRequest('/messages/incoming', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getQuickReplies: () => apiRequest('/quick-replies'),

  // Gestão Dinâmica de Vendedores (Sellers), PIN Individual & Modo Supervisor
  getSellers: (includeInactive = false) =>
    apiRequest(`/sellers${includeInactive ? '?include_inactive=true' : ''}`),
  createSeller: (payload) =>
    apiRequest('/sellers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSeller: (sellerId, payload) =>
    apiRequest(`/sellers/${sellerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  authenticateSeller: (sellerId, pin) =>
    apiRequest('/sellers/authenticate', {
      method: 'POST',
      body: JSON.stringify({ seller_id: sellerId, pin }),
    }),
  impersonateSeller: (targetSellerId, supervisorName = 'Supervisor') =>
    apiRequest('/sellers/impersonate', {
      method: 'POST',
      body: JSON.stringify({
        target_seller_id: targetSellerId,
        supervisor_name: supervisorName,
      }),
    }),

  // Funil CRM / Kanban
  getKanban: (pipelineId = '') =>
    apiRequest(`/kanban${pipelineId ? `?pipeline_id=${encodeURIComponent(pipelineId)}` : ''}`),
  moveDealStage: (dealId, stageId, value) =>
    apiRequest(`/deals/${dealId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage_id: stageId, value }),
    }),

  // WhatsApp QR Code & API Oficial da Meta
  getWhatsAppStatus: () => apiRequest('/whatsapp/status'),
  connectWhatsApp: () => apiRequest('/whatsapp/connect', { method: 'POST' }),
  simulateWhatsAppScan: () => apiRequest('/whatsapp/simulate-scan', { method: 'POST' }),
  disconnectWhatsApp: () => apiRequest('/whatsapp/disconnect', { method: 'POST' }),
  getMetaConfig: () => apiRequest('/meta/config'),
  saveMetaConfig: (payload) =>
    apiRequest('/meta/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  testMetaConnection: () => apiRequest('/meta/test-connection', { method: 'POST' }),
  simulateMetaWebhook: (payload) =>
    apiRequest('/webhooks/meta', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  replyInstagramComment: (payload) =>
    apiRequest('/instagram/reply-comment', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Autenticação & Super Admin Multi-Tenant (Inadimplência)
  login: (email, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  quickSwitchProfile: (targetRole) =>
    apiRequest('/auth/quick-switch', {
      method: 'POST',
      body: JSON.stringify({ target_role: targetRole }),
    }),
  getTenants: () => apiRequest('/admin/tenants'),
  createTenant: (payload) =>
    apiRequest('/admin/tenants', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleTenantStatus: (tenantId, isActive = null) =>
    apiRequest(`/admin/tenants/${tenantId}/toggle-status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    }),
};

export function createRealtimeSocket(onEvent) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}/ws`;
  let ws = null;
  let reconnectTimer = null;
  let closedManually = false;

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        onEvent?.({ event: 'ws_connected', data: { connected: true } });
      };
      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          onEvent?.(parsed);
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        onEvent?.({ event: 'ws_disconnected', data: { connected: false } });
        if (!closedManually) {
          reconnectTimer = setTimeout(connect, 3500);
        }
      };
    } catch {
      if (!closedManually) {
        reconnectTimer = setTimeout(connect, 3500);
      }
    }
  };

  connect();

  return () => {
    closedManually = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  };
}

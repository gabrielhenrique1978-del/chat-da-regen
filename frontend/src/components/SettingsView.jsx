import React, { useState, useEffect } from 'react';
import {
  Crown,
  Building2,
  ShieldCheck,
  Award,
  Plus,
  Lock,
  Unlock,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  StatusDot,
  fieldClass,
} from './ui';

export default function SettingsView({ authUser, onSwitchAuthRole }) {
  const [tenants, setTenants] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [provisionResult, setProvisionResult] = useState(null);
  const [securityInfo, setSecurityInfo] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const isSuperAdmin =
    authUser?.role === 'super_admin' || authUser?.is_super_admin;

  const loadTenantsAndSecurity = async () => {
    try {
      const [sec, logsRes] = await Promise.all([
        api.getSecurityStatus(),
        api.getAuditLogs(30),
      ]);
      setSecurityInfo(sec);
      setAuditLogs(logsRes?.logs || []);
    } catch {
      // ignore
    }
    if (isSuperAdmin) {
      try {
        if (!localStorage.getItem('regenflow_auth_token')) {
          const sw = await api.quickSwitchProfile('super_admin');
          localStorage.setItem('regenflow_auth_token', sw.access_token);
        }
        const data = await api.getTenants();
        setTenants(data.tenants || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    loadTenantsAndSecurity();
  }, [isSuperAdmin]);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!companyName.trim() || !adminEmail.trim()) return;
    try {
      const res = await api.createTenant({
        name: companyName.trim(),
        admin_name: adminName.trim() || companyName.trim(),
        admin_email: adminEmail.trim(),
      });
      setProvisionResult(res);
      setCompanyName('');
      setAdminName('');
      setAdminEmail('');
      await loadTenantsAndSecurity();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleToggleTenant = async (tenant) => {
    try {
      await api.toggleTenantStatus(tenant.id, !tenant.is_active);
      await loadTenantsAndSecurity();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-canvas text-fg">
      {/* Cabeçalho */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div>
          <h1 className="text-sm font-semibold text-fg">
            {isSuperAdmin ? 'Administração Global' : 'Configurações da Empresa'}
          </h1>
          <p className="text-2xs text-muted">
            {isSuperAdmin
              ? 'Gestão de empresas clientes, segurança de dados e trilha de auditoria.'
              : 'Ambiente operacional da empresa e políticas de dados.'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={isSuperAdmin ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onSwitchAuthRole('super_admin')}
          >
            <Crown size={13} />
            <span>Visão Super Admin</span>
          </Button>
          <Button
            variant={!isSuperAdmin ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onSwitchAuthRole('tenant')}
          >
            <Building2 size={13} />
            <span>Visão Empresa Cliente</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {feedback && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-xs text-fg"
          >
            <span>{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-muted hover:text-fg"
            >
              ✕
            </button>
          </div>
        )}

        {/* Painel do Super Admin: Provisionamento e Bloqueio de Clientes */}
        {isSuperAdmin && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Formulário de Provisionamento */}
            <form
              onSubmit={handleCreateTenant}
              className="rounded-lg border border-line bg-surface p-5 space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <Plus size={15} className="text-primary" />
                <h2 className="text-xs font-medium text-fg">
                  Nova empresa cliente (Tenant)
                </h2>
              </div>

              <Field label="Nome da empresa">
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Clínica Sorriso"
                  className={fieldClass}
                />
              </Field>

              <Field label="Nome do gestor / administrador">
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex: Dr. Marcos"
                  className={fieldClass}
                />
              </Field>

              <Field label="E-mail de acesso">
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  className={fieldClass}
                />
              </Field>

              <Button type="submit" variant="primary" className="w-full">
                Provisionar empresa e gerar acesso
              </Button>

              {provisionResult && (
                <div className="rounded-md border border-line bg-canvas p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-2xs font-medium text-fg">
                    <span>Senha temporária: {provisionResult.temporary_password}</span>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          provisionResult.whatsapp_welcome_message
                        )
                      }
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Copy size={11} />
                      <span>Copiar dados</span>
                    </button>
                  </div>
                  <pre className="text-2xs font-mono p-2 rounded bg-surface border border-line whitespace-pre-wrap text-muted">
                    {provisionResult.whatsapp_welcome_message}
                  </pre>
                </div>
              )}
            </form>

            {/* Lista de Empresas Clientes */}
            <div className="lg:col-span-2 rounded-lg border border-line bg-surface overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <span className="text-xs font-medium text-fg">
                  Empresas clientes ({tenants.length})
                </span>
                <span className="text-2xs text-muted">
                  Bloqueio em tempo real (HTTP 403)
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line">
                {tenants.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted">
                    Nenhuma empresa cadastrada.
                  </div>
                ) : (
                  tenants.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-elevated/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-fg">
                            {t.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-2xs text-muted">
                            <StatusDot tone={t.is_active ? 'primary' : 'accent'} />
                            <span>{t.is_active ? 'Ativo' : 'Suspenso'}</span>
                          </span>
                        </div>
                        <p className="text-2xs text-muted mt-0.5">
                          Admin: {t.admin_email || '—'} · {t.users_count || 1} operador(es)
                        </p>
                      </div>

                      <Button
                        variant={t.is_active ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => handleToggleTenant(t)}
                      >
                        {t.is_active ? (
                          <>
                            <Lock size={12} />
                            <span>Suspender</span>
                          </>
                        ) : (
                          <>
                            <Unlock size={12} />
                            <span>Reativar</span>
                          </>
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Segurança Criptográfica & Autoria */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-line bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-fg">
              <ShieldCheck size={16} className="text-primary" />
              <span>Criptografia de ponta a ponta em repouso</span>
            </div>
            <p className="text-xs text-fg">
              Algoritmo ativo:{' '}
              <span className="font-mono text-primary font-medium">
                {securityInfo?.cipher_algorithm || 'AES-256-CBC + HMAC-SHA256'}
              </span>
            </p>
            <p className="text-2xs text-muted leading-relaxed">
              Contatos protegidos: {securityInfo?.metrics?.encrypted_contacts_count || 0} · 
              Mensagens cifradas: {securityInfo?.metrics?.encrypted_messages_count || 0}
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-fg">
              <Award size={16} className="text-primary" />
              <span>Autoria e licença oficial</span>
            </div>
            <p className="text-xs font-medium text-fg">
              Desenvolvido por Gabriel Henrique e Otavio Santana
            </p>
            <p className="text-2xs text-muted leading-relaxed">
              Copyright © 2026 Gabriel Henrique & Otavio Santana. Todos os direitos reservados sob Licença MIT.
              Arquitetura em React, Vite, Tailwind CSS, FastAPI e Neon PostgreSQL.
            </p>
          </div>
        </div>

        {/* Trilha de Auditoria (LGPD Art. 37) */}
        <div className="rounded-lg border border-line bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-muted" />
              <span className="text-xs font-medium text-fg">
                Trilha de auditoria imutável (LGPD Art. 37)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTenantsAndSecurity}
            >
              <RefreshCw size={12} />
              <span>Atualizar logs</span>
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-line">
            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                Nenhum evento registrado.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-elevated/40 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xs font-medium text-primary">
                        {log.action}
                      </span>
                      <span className="font-medium text-fg">{log.actor}</span>
                      <span className="text-2xs text-muted">
                        ({log.actor_role})
                      </span>
                    </div>
                    <p className="text-2xs text-muted">{log.details}</p>
                  </div>
                  <span className="text-2xs tabular-nums font-mono text-muted shrink-0">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

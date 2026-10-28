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
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

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
        // Garante token de super_admin se ainda não houver no localStorage
        if (!localStorage.getItem('openchatfunnel_auth_token')) {
          const sw = await api.quickSwitchProfile('super_admin');
          localStorage.setItem('openchatfunnel_auth_token', sw.access_token);
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
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950 space-y-6">
      {/* Topo: Identidade Super Admin vs Tenant */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
              isSuperAdmin
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
            )}
          >
            {isSuperAdmin ? <Crown size={24} /> : <Building2 size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {isSuperAdmin
                  ? 'Painel Master — Super Admin (Proprietário)'
                  : `Ambiente da Empresa: ${
                      authUser?.tenant_name || 'Tenant Cliente'
                    }`}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                role: {authUser?.role || 'super_admin'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isSuperAdmin
                ? 'Você está autenticado como Super Admin Master com permissão global para provisionar e bloquear empresas clientes.'
                : 'Você está autenticado como uma Empresa Cliente (Tenant). O painel de gestão B2B de outras empresas fica oculto.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onSwitchAuthRole('super_admin')}
            className={cn(
              'px-3.5 py-2 rounded-xl text-xs font-bold border transition',
              isSuperAdmin
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            )}
          >
            👑 Visão Super Admin
          </button>
          <button
            onClick={() => onSwitchAuthRole('tenant')}
            className={cn(
              'px-3.5 py-2 rounded-xl text-xs font-bold border transition',
              !isSuperAdmin
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            )}
          >
            🏢 Visão Tenant Cliente
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex justify-between">
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Seção Exclusiva Super Admin: Gestão de Empresas Clientes (Tenants) e Inadimplência */}
      {isSuperAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cadastrar Nova Empresa Cliente */}
          <form
            onSubmit={handleCreateTenant}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Plus size={15} />
              Cadastrar Nova Empresa Cliente (Tenant)
            </h2>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Nome da Empresa *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Clínica Sorriso Perfeito"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Nome do Gestor / Admin
              </label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Ex: Dr. Marcos"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                E-mail de Login *
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="contato@clinica.com.br"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition"
            >
              Provisionar Empresa + Senha Provisória
            </button>

            {provisionResult && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                  <span>Senha: {provisionResult.temporary_password}</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        provisionResult.whatsapp_welcome_message
                      )
                    }
                    className="inline-flex items-center gap-1 text-[10px] underline"
                  >
                    <Copy size={11} /> Copiar Msg
                  </button>
                </div>
                <pre className="text-[10px] whitespace-pre-wrap font-mono bg-white dark:bg-slate-900 p-2 rounded border border-emerald-200 dark:border-emerald-800">
                  {provisionResult.whatsapp_welcome_message}
                </pre>
              </div>
            )}
          </form>

          {/* Lista de Empresas & Trava de Inadimplência */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                Empresas Clientes Cadastradas ({tenants.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Bloqueio em Tempo Real (HTTP 403 Forbidden)
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {tenants.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhuma empresa cliente cadastrada ainda.
                </div>
              ) : (
                tenants.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {t.name}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold',
                            t.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          )}
                        >
                          {t.is_active
                            ? 'Ativo (Adimplente)'
                            : 'Suspenso (Inadimplente 403)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Admin: {t.admin_email || '—'} • {t.users_count || 1}{' '}
                        usuário(s)
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleTenant(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition',
                        t.is_active
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      )}
                    >
                      {t.is_active ? (
                        <>
                          <Lock size={13} />
                          <span>Bloquear por Inadimplência</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={13} />
                          <span>Desbloquear Acesso</span>
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Segurança AES-256 & Licença Oficial de Autoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase">
            <ShieldCheck size={16} />
            Segurança Criptográfica & Banco em Nuvem (Neon PostgreSQL)
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Algoritmo ativo:{' '}
            <strong>
              {securityInfo?.cipher_algorithm || 'AES-256-CBC + HMAC-SHA256'}
            </strong>
          </p>
          <p className="text-[11px] text-slate-500">
            Contatos criptografados:{' '}
            {securityInfo?.metrics?.encrypted_contacts_count || 0} • Mensagens
            cifradas: {securityInfo?.metrics?.encrypted_messages_count || 0}
          </p>
        </div>

        {/* Card Oficial de Licença & Autoria */}
        <div className="bg-gradient-to-br from-emerald-900 to-slate-900 text-white rounded-2xl p-5 space-y-2 shadow-md border border-emerald-700/40">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
            <Award size={18} />
            Licença Oficial & Propriedade Intelectual
          </div>
          <h3 className="text-sm font-extrabold">
            Desenvolvido por Gabriel Henrique e Otavio Santana
          </h3>
          <p className="text-xs text-emerald-100/80 leading-relaxed">
            Copyright © 2026 <strong>Gabriel Henrique</strong> &{' '}
            <strong>Otavio Santana</strong>. Todos os direitos reservados sob
            Licença MIT. Arquitetura Full Stack em React, Vite, Tailwind CSS,
            FastAPI e Neon PostgreSQL Cloud.
          </p>
        </div>
      </div>

      {/* Trilha de Auditoria Imutável (LGPD Art. 37 & Governança de Equipe) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Trilha de Auditoria Imutável & Operações LGPD (Art. 37)
            </span>
          </div>
          <button
            type="button"
            onClick={loadTenantsAndSecurity}
            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            ↻ Atualizar Logs
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Nenhum evento de auditoria registrado ainda.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                      {log.action}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {log.actor}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase">
                      ({log.actor_role})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {log.details}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString('pt-BR')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

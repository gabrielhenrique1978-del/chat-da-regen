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
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-[#0A0D14] text-[#F8FAFC] space-y-6">
      {/* Topo: Identidade Super Admin vs Tenant */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border',
              isSuperAdmin
                ? 'bg-[#1B2333] text-[#00D2FF] border-[#00D2FF]/30'
                : 'bg-[#1B2333] text-[#A5B4FC] border-[#6366F1]/30'
            )}
          >
            {isSuperAdmin ? <Crown size={22} /> : <Building2 size={22} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#F8FAFC]">
                {isSuperAdmin
                  ? 'Painel Master — Super Admin (Proprietário)'
                  : `Ambiente da Empresa: ${
                      authUser?.tenant_name || 'Tenant Cliente'
                    }`}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[#1B2333] text-[#00D2FF] border border-[#00D2FF]/20">
                role: {authUser?.role || 'super_admin'}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
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
              'px-3.5 py-2 rounded-xl text-xs font-semibold border transition',
              isSuperAdmin
                ? 'bg-[#00D2FF] text-[#0A0D14] border-[#00D2FF] font-bold'
                : 'bg-[#0A0D14] text-[#94A3B8] border-[#1E293B] hover:text-[#F8FAFC] hover:bg-[#1B2333]'
            )}
          >
            👑 Visão Super Admin
          </button>
          <button
            onClick={() => onSwitchAuthRole('tenant')}
            className={cn(
              'px-3.5 py-2 rounded-xl text-xs font-semibold border transition',
              !isSuperAdmin
                ? 'bg-[#6366F1] text-white border-[#6366F1] font-bold'
                : 'bg-[#0A0D14] text-[#94A3B8] border-[#1E293B] hover:text-[#F8FAFC] hover:bg-[#1B2333]'
            )}
          >
            🏢 Visão Tenant Cliente
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs font-semibold flex justify-between">
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
            className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4 shadow-card"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#00D2FF] flex items-center gap-1.5">
              <Plus size={15} />
              Cadastrar Nova Empresa Cliente (Tenant)
            </h2>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                Nome da Empresa *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Clínica Sorriso Perfeito"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                Nome do Gestor / Admin
              </label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Ex: Dr. Marcos"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                E-mail de Login *
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="contato@clinica.com.br"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold transition shadow-xs"
            >
              Provisionar Empresa + Senha Provisória
            </button>

            {provisionResult && (
              <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs space-y-2">
                <div className="font-semibold text-[#00D2FF] flex items-center justify-between">
                  <span>Senha: {provisionResult.temporary_password}</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        provisionResult.whatsapp_welcome_message
                      )
                    }
                    className="inline-flex items-center gap-1 text-[10px] underline hover:text-[#38BDF8]"
                  >
                    <Copy size={11} /> Copiar Msg
                  </button>
                </div>
                <pre className="text-[10px] whitespace-pre-wrap font-mono bg-[#121824] p-2 rounded border border-[#1E293B] text-[#F8FAFC]">
                  {provisionResult.whatsapp_welcome_message}
                </pre>
              </div>
            )}
          </form>

          {/* Lista de Empresas & Trava de Inadimplência */}
          <div className="lg:col-span-2 bg-[#121824] border border-[#1E293B] rounded-2xl overflow-hidden shadow-card">
            <div className="px-5 py-4 border-b border-[#1E293B] bg-[#0A0D14]/40 flex items-center justify-between">
              <span className="font-semibold text-xs text-[#F8FAFC]">
                Empresas Clientes Cadastradas ({tenants.length})
              </span>
              <span className="text-[11px] text-[#94A3B8]">
                Bloqueio em Tempo Real (HTTP 403 Forbidden)
              </span>
            </div>

            <div className="divide-y divide-[#1E293B]/60">
              {tenants.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8]">
                  Nenhuma empresa cliente cadastrada ainda.
                </div>
              ) : (
                tenants.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-[#1B2333]/40 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#F8FAFC]">
                          {t.name}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                            t.is_active
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
                          )}
                        >
                          {t.is_active
                            ? 'Ativo (Adimplente)'
                            : 'Suspenso (Inadimplente 403)'}
                        </span>
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        Admin: {t.admin_email || '—'} • {t.users_count || 1}{' '}
                        usuário(s)
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleTenant(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition border',
                        t.is_active
                          ? 'border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40'
                          : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
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
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-2 shadow-card">
          <div className="flex items-center gap-2 text-[#00D2FF] font-bold text-xs uppercase">
            <ShieldCheck size={16} />
            Segurança Criptográfica & Banco em Nuvem (Neon PostgreSQL)
          </div>
          <p className="text-xs text-[#F8FAFC]">
            Algoritmo ativo:{' '}
            <strong className="text-[#00D2FF]">
              {securityInfo?.cipher_algorithm || 'AES-256-CBC + HMAC-SHA256'}
            </strong>
          </p>
          <p className="text-[11px] text-[#94A3B8]">
            Contatos criptografados:{' '}
            {securityInfo?.metrics?.encrypted_contacts_count || 0} • Mensagens
            cifradas: {securityInfo?.metrics?.encrypted_messages_count || 0}
          </p>
        </div>

        {/* Card Oficial de Licença & Autoria */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-2 shadow-card">
          <div className="flex items-center gap-2 text-[#00D2FF] font-bold text-xs uppercase tracking-wider">
            <Award size={18} />
            Licença Oficial & Propriedade Intelectual
          </div>
          <h3 className="text-sm font-bold text-[#F8FAFC]">
            Desenvolvido por Gabriel Henrique e Otavio Santana
          </h3>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Copyright © 2026 <strong className="text-[#F8FAFC]">Gabriel Henrique</strong> &{' '}
            <strong className="text-[#F8FAFC]">Otavio Santana</strong>. Todos os direitos reservados sob
            Licença MIT. Arquitetura Full Stack em React, Vite, Tailwind CSS,
            FastAPI e Neon PostgreSQL Cloud.
          </p>
        </div>
      </div>

      {/* Trilha de Auditoria Imutável (LGPD Art. 37 & Governança de Equipe) */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl overflow-hidden shadow-card">
        <div className="px-5 py-4 border-b border-[#1E293B] bg-[#0A0D14]/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#00D2FF]" />
            <span className="font-semibold text-xs uppercase tracking-wider text-[#F8FAFC]">
              Trilha de Auditoria Imutável & Operações LGPD (Art. 37)
            </span>
          </div>
          <button
            type="button"
            onClick={loadTenantsAndSecurity}
            className="text-[11px] font-semibold text-[#00D2FF] hover:underline"
          >
            ↻ Atualizar Logs
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-[#1E293B]/60">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#94A3B8]">
              Nenhum evento de auditoria registrado ainda.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-[#1B2333]/40 transition"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#0A0D14] border border-[#1E293B] font-mono text-[10px] font-semibold text-[#00D2FF]">
                      {log.action}
                    </span>
                    <span className="font-semibold text-[#F8FAFC]">
                      {log.actor}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] uppercase">
                      ({log.actor_role})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    {log.details}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-[#94A3B8] shrink-0">
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

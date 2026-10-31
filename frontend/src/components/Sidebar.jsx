import React from 'react';
import {
  MessageSquare,
  Kanban,
  Users,
  Smartphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Crown,
  Building2,
  Award,
  Lock,
  Eye,
  KeyRound,
} from 'lucide-react';
import { cn, getInitials } from '../lib/utils';
import regenLogo from '../assets/logo.png';

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  darkMode,
  setDarkMode,
  sellers = [],
  activeSeller,
  isSupervisorMode,
  impersonatedSeller,
  onImpersonateSeller,
  onExitImpersonation,
  onOpenPinModal,
  authUser,
  onOpenAuthModal,
  wsConnected,
  stats,
}) {
  const isSuperAdmin =
    authUser?.role === 'super_admin' || authUser?.is_super_admin;

  const navItems = [
    {
      id: 'inbox',
      label: 'Atendimento',
      icon: MessageSquare,
      badge: stats?.total_contacts || null,
    },
    {
      id: 'kanban',
      label: 'CRM / Funil',
      icon: Kanban,
      badge: stats?.open_deals_count || null,
    },
    {
      id: 'sellers',
      label: 'Vendedores & Equipe',
      icon: Users,
      badge: sellers?.length || null,
    },
    {
      id: 'connections',
      label: 'WhatsApp & Meta',
      icon: Smartphone,
    },
    {
      id: 'settings',
      label: isSuperAdmin ? 'Super Admin & Config' : 'Configurações',
      icon: Settings,
    },
  ];

  return (
    <aside
      className={cn(
        'h-full flex flex-col border-r border-[#1E293B] bg-[#121824] text-[#F8FAFC] transition-all duration-300 select-none shrink-0 z-20',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Topo / Logomarca Oficial REGEN FLOW (Alinhado em h-16 com todas as colunas) */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#1E293B] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden group cursor-pointer">
          <div className="w-9 h-9 rounded-xl bg-[#0A0D14] border border-[#1E293B] p-1 flex items-center justify-center shrink-0 group-hover:border-[#00D2FF]/40 transition duration-200 overflow-hidden shadow-subtle">
            <img
              src={regenLogo}
              alt="REGEN FLOW"
              className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-200"
            />
          </div>
          {!collapsed && (
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-wide bg-gradient-to-r from-[#00D2FF] via-[#38BDF8] to-[#6366F1] bg-clip-text text-transparent">
                  REGEN FLOW
                </span>
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    wsConnected
                      ? 'bg-[#00D2FF]'
                      : 'bg-amber-400'
                  )}
                  title={
                    wsConnected
                      ? 'WebSocket conectado em tempo real'
                      : 'Reconectando...'
                  }
                />
              </div>
              <p className="text-[11px] text-[#94A3B8] truncate">
                Omnichannel & AI CRM
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333] transition"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Identidade do Operador: Sessão Travada (Vendedor) vs Modo Supervisor (Espelhamento) */}
      <div className="p-3 border-b border-[#1E293B] space-y-2">
        {isSupervisorMode ? (
          <div
            className={cn(
              'rounded-xl bg-[#0A0D14] border border-[#1E293B] p-2.5 space-y-2 shadow-subtle',
              collapsed && 'flex flex-col items-center p-2'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#4C1D95] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  <Eye size={15} />
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      {impersonatedSeller
                        ? 'Espelhando Vendedor:'
                        : 'Modo Supervisor'}
                    </span>
                    <span className="block text-xs font-bold text-[#F8FAFC] truncate">
                      {impersonatedSeller
                        ? impersonatedSeller.name
                        : 'Visão Geral da Equipe'}
                    </span>
                  </div>
                )}
              </div>
              {!collapsed && (
                <button
                  onClick={onOpenPinModal}
                  className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#00D2FF] hover:bg-[#1B2333] transition"
                  title="Travar sessão em um único vendedor (Modo Vendedor)"
                >
                  <KeyRound size={14} />
                </button>
              )}
            </div>

            {!collapsed && (
              <div className="space-y-1.5 pt-1.5 border-t border-[#1E293B]">
                <label className="block text-[10px] font-medium text-[#94A3B8]">
                  Entrar na conta de (Auditoria):
                </label>
                <select
                  value={impersonatedSeller?.id || '__SUPERVISOR_ALL__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__SUPERVISOR_ALL__') {
                      onExitImpersonation?.();
                    } else {
                      const found = sellers.find(
                        (s) => String(s.id) === String(val)
                      );
                      if (found) onImpersonateSeller?.(found);
                    }
                  }}
                  className="w-full rounded-lg bg-[#121824] border border-[#1E293B] px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF] cursor-pointer"
                >
                  <option value="__SUPERVISOR_ALL__">
                    👑 Supervisor (Ver Todos)
                  </option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      🎧 Conta de: {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          /* MODO VENDEDOR TRAVADO: O vendedor só pode usar seu próprio nome */
          <div
            className={cn(
              'rounded-xl bg-[#0A0D14] border border-[#1E293B] p-2.5 space-y-2 shadow-subtle',
              collapsed && 'flex flex-col items-center p-2'
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#00D2FF] to-[#0072FF] text-[#0A0D14] flex items-center justify-center text-xs font-extrabold shrink-0">
                {getInitials(activeSeller?.name || 'Vendedor')}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#00D2FF]">
                    <Lock size={10} /> Conta Ativa:
                  </span>
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    {activeSeller?.name || 'Vendedor'}
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                onClick={onOpenPinModal}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[#121824] border border-[#1E293B] text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333] flex items-center justify-center gap-1.5 transition"
                title="Exige PIN do vendedor ou credencial de Supervisor"
              >
                <KeyRound size={12} />
                <span>Trocar Operador / Supervisor</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navegação Principal: Sóbria, com indicador ativo nítido */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors relative group',
                active
                  ? 'bg-[#1B2333] text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333]/50',
                collapsed && 'justify-center px-2'
              )}
            >
              {/* Indicador sutil de item ativo na navegação lateral (traço vertical) */}
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-[#00D2FF] rounded-r-full" />
              )}
              <div className="flex items-center gap-3">
                <Icon
                  size={18}
                  className={cn(
                    'shrink-0 transition-colors',
                    active ? 'text-[#00D2FF]' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && item.badge !== null && item.badge !== undefined && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    active
                      ? 'bg-[#00D2FF]/15 text-[#00D2FF] border border-[#00D2FF]/20'
                      : 'bg-[#0A0D14] text-[#94A3B8] border border-[#1E293B]'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Identidade Super Admin vs Tenant & Tema */}
      <div className="p-3 border-t border-[#1E293B] space-y-2">
        <button
          onClick={onOpenAuthModal}
          className={cn(
            'w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition',
            isSuperAdmin
              ? 'bg-[#0A0D14] border-[#1E293B] text-[#F8FAFC] hover:border-[#00D2FF]/40'
              : 'bg-[#0A0D14] border-[#1E293B] text-[#F8FAFC] hover:border-[#6366F1]/40',
            collapsed && 'justify-center'
          )}
          title="Alternar ou autenticar perfil (Super Admin Master vs Tenant)"
        >
          {isSuperAdmin ? (
            <Crown size={16} className="text-[#00D2FF] shrink-0" />
          ) : (
            <Building2 size={16} className="text-[#6366F1] shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold truncate">
                {isSuperAdmin
                  ? 'Super Admin Master'
                  : authUser?.tenant_name || 'Empresa Cliente'}
              </div>
              <div className="text-[10px] text-[#94A3B8] truncate">
                {isSuperAdmin ? 'Acesso Global B2B' : 'Ambiente Tenant'}
              </div>
            </div>
          )}
        </button>

        {/* Créditos & Licença Oficial */}
        {!collapsed && (
          <div className="pt-1 px-1 text-[10px] text-[#94A3B8] leading-tight flex items-start gap-1.5">
            <Award size={13} className="text-[#00D2FF] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#F8FAFC]">
                REGEN FLOW • Licença MIT
              </span>
              <br />
              Desenvolvido por <strong>Gabriel Henrique</strong> &{' '}
              <strong>Otavio Santana</strong>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

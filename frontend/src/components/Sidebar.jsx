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
  ShieldCheck,
  Award,
  Lock,
  Eye,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { cn, getInitials } from '../lib/utils';

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
        'h-screen flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 select-none shrink-0 z-20',
        collapsed ? 'w-20' : 'w-68'
      )}
    >
      {/* Topo / Logo */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0">
            CR
          </div>
          {!collapsed && (
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
                  Chat da Regen
                </span>
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    wsConnected ? 'bg-emerald-500' : 'bg-amber-400'
                  )}
                  title={
                    wsConnected
                      ? 'WebSocket conectado em tempo real'
                      : 'Reconectando...'
                  }
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                SaaS Omnichannel & CRM
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Identidade do Operador: Sessão Travada (Vendedor) vs Modo Supervisor (Espelhamento) */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
        {isSupervisorMode ? (
          <div
            className={cn(
              'rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800/70 p-2.5 space-y-2',
              collapsed && 'flex flex-col items-center p-2'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                  <Eye size={15} />
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      {impersonatedSeller
                        ? 'Espelhando Vendedor:'
                        : 'Modo Supervisor Global'}
                    </span>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">
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
                  className="p-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 transition"
                  title="Travar sessão em um único vendedor (Modo Vendedor)"
                >
                  <KeyRound size={14} />
                </button>
              )}
            </div>

            {!collapsed && (
              <div className="space-y-1.5 pt-1 border-t border-amber-200/70 dark:border-amber-800/50">
                <label className="block text-[10px] font-bold text-amber-900 dark:text-amber-200">
                  👁️ Entrar na conta de (Impersonation):
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
                  className="w-full rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
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
              'rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 p-2.5 space-y-2',
              collapsed && 'flex flex-col items-center p-2'
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {getInitials(activeSeller?.name || 'Vendedor')}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                    <Lock size={10} /> Conta Travada:
                  </span>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {activeSeller?.name || 'Vendedor'}
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                onClick={onOpenPinModal}
                className="w-full py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 flex items-center justify-center gap-1.5 transition"
                title="Exige PIN do vendedor ou credencial de Supervisor"
              >
                <KeyRound size={12} />
                <span>Trocar Operador / Supervisor</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navegação Principal */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
                active
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70',
                collapsed && 'justify-center px-2'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && item.badge !== null && item.badge !== undefined && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button
          onClick={onOpenAuthModal}
          className={cn(
            'w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition',
            isSuperAdmin
              ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
              : 'bg-indigo-50/90 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200',
            collapsed && 'justify-center'
          )}
          title="Alternar ou autenticar perfil (Super Admin Master vs Tenant)"
        >
          {isSuperAdmin ? (
            <Crown size={16} className="text-amber-600 shrink-0" />
          ) : (
            <Building2 size={16} className="text-indigo-600 shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold truncate">
                {isSuperAdmin
                  ? 'Super Admin Master'
                  : authUser?.tenant_name || 'Empresa Cliente'}
              </div>
              <div className="text-[10px] opacity-75 truncate">
                {isSuperAdmin ? 'Acesso Global B2B' : 'Ambiente Tenant'}
              </div>
            </div>
          )}
        </button>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Alternar tema Claro / Escuro"
          >
            {darkMode ? (
              <Sun size={15} className="text-amber-400" />
            ) : (
              <Moon size={15} />
            )}
            {!collapsed && (
              <span>{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
            )}
          </button>
        </div>

        {/* Créditos & Licença Oficial */}
        {!collapsed && (
          <div className="pt-1 px-1 text-[10px] text-slate-400 dark:text-slate-500 leading-tight flex items-start gap-1.5">
            <Award size={13} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                Licença Oficial MIT
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

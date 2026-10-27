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
} from 'lucide-react';
import { cn, getInitials } from '../lib/utils';

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  darkMode,
  setDarkMode,
  sellers,
  activeSeller,
  onSelectSeller,
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
      label: 'Vendedores',
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
        collapsed ? 'w-20' : 'w-64'
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

      {/* Seletor Rápido do Vendedor Operando */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <div
          className={cn(
            'rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 p-2.5 flex items-center gap-2.5',
            collapsed && 'justify-center'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {getInitials(activeSeller?.name || 'Vendedor')}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Operando como:
              </span>
              <select
                value={activeSeller?.id || ''}
                onChange={(e) => onSelectSeller(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer truncate"
              >
                {sellers.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
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
            {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
            {!collapsed && <span>{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>}
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

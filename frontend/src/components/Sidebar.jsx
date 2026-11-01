import React from 'react';
import {
  MessageSquare,
  Kanban,
  Users,
  Smartphone,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Crown,
  Building2,
  Eye,
  KeyRound,
  Lock,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Avatar, IconButton, StatusDot } from './ui';
import regenLogo from '../assets/logo.png';

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
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
    { id: 'inbox', label: 'Atendimento', icon: MessageSquare, count: stats?.total_contacts },
    { id: 'kanban', label: 'Funil de vendas', icon: Kanban, count: stats?.open_deals_count },
    { id: 'sellers', label: 'Equipe', icon: Users, count: sellers?.length },
    { id: 'connections', label: 'Conexões', icon: Smartphone },
    { id: 'settings', label: isSuperAdmin ? 'Administração' : 'Configurações', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'z-20 flex h-full shrink-0 select-none flex-col border-r border-line bg-surface text-fg transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Marca */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center px-2' : 'justify-between pl-4 pr-2'
        )}
      >
        {!collapsed && (
          <div className="group flex min-w-0 items-center gap-2.5">
            <img
              src={regenLogo}
              alt="REGEN FLOW"
              className="h-7 w-7 shrink-0 rounded-md object-contain transition-opacity group-hover:opacity-90"
            />
            <span className="truncate text-sm font-semibold tracking-tight text-fg">
              Regen Flow
            </span>
            <StatusDot
              tone={wsConnected ? 'primary' : 'muted'}
              pulse={!wsConnected}
              className="ml-0.5"
            />
          </div>
        )}
        <IconButton
          label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </IconButton>
      </div>

      {/* Operador */}
      <div className={cn('border-b border-line', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <button
            onClick={onOpenPinModal}
            title={
              isSupervisorMode
                ? impersonatedSeller
                  ? `Supervisor espelhando ${impersonatedSeller.name}`
                  : 'Modo supervisor'
                : activeSeller?.name
            }
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-md hover:bg-elevated"
          >
            {isSupervisorMode ? (
              <Eye size={16} className="text-accent" />
            ) : (
              <Avatar name={activeSeller?.name || 'Vendedor'} size="sm" tone="primary" />
            )}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              {isSupervisorMode ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15">
                  <Eye size={14} className="text-accent" />
                </span>
              ) : (
                <Avatar name={activeSeller?.name || 'Vendedor'} size="sm" tone="primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-fg">
                  {isSupervisorMode
                    ? impersonatedSeller
                      ? impersonatedSeller.name
                      : 'Supervisor'
                    : activeSeller?.name || 'Vendedor'}
                </p>
                <p className="flex items-center gap-1 truncate text-2xs text-muted">
                  {isSupervisorMode ? (
                    impersonatedSeller ? 'Espelhando conta' : 'Visão da equipe'
                  ) : (
                    <>
                      <Lock size={10} /> Sessão pessoal
                    </>
                  )}
                </p>
              </div>
              <IconButton
                label={isSupervisorMode ? 'Travar em um vendedor' : 'Trocar operador'}
                size="sm"
                onClick={onOpenPinModal}
              >
                <KeyRound size={14} />
              </IconButton>
            </div>

            {isSupervisorMode && (
              <select
                aria-label="Espelhar conta de vendedor"
                value={impersonatedSeller?.id || '__SUPERVISOR_ALL__'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__SUPERVISOR_ALL__') {
                    onExitImpersonation?.();
                  } else {
                    const found = sellers.find((s) => String(s.id) === String(val));
                    if (found) onImpersonateSeller?.(found);
                  }
                }}
                className="h-7 w-full rounded-md border border-line bg-canvas px-2 text-2xs text-fg focus:border-primary/60 focus:outline-none"
              >
                <option value="__SUPERVISOR_ALL__">Todas as contas</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'px-2.5',
                active ? 'bg-elevated text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg'
              )}
            >
              {active && (
                <span className="absolute -left-2 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
              )}
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.75}
                className={cn('shrink-0', active ? 'text-primary' : 'text-muted group-hover:text-fg')}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {Number(item.count) > 0 && (
                    <span className="text-2xs tabular-nums text-muted">{item.count}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Ambiente e créditos */}
      <div className="space-y-2 border-t border-line p-2">
        <button
          onClick={onOpenAuthModal}
          title="Ambiente e perfil de acesso"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-elevated',
            collapsed && 'justify-center'
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas">
            {isSuperAdmin ? (
              <Crown size={14} className="text-primary" />
            ) : (
              <Building2 size={14} className="text-muted" />
            )}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">
                {isSuperAdmin ? 'Super Admin' : authUser?.tenant_name || 'Empresa'}
              </p>
              <p className="truncate text-2xs text-muted">
                {isSuperAdmin ? 'Acesso global' : 'Ambiente da empresa'}
              </p>
            </div>
          )}
        </button>

        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] leading-snug text-muted/70">
            Regen Flow · MIT · por Gabriel Henrique & Otavio Santana
          </p>
        )}
      </div>
    </aside>
  );
}

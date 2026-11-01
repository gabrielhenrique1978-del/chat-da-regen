/**
 * REGEN FLOW — Primitivas de interface
 * Fonte única para botões, badges, avatares, campos e modais.
 * Desenvolvido por Gabriel Henrique e Otavio Santana
 */
import React from 'react';
import { X } from 'lucide-react';
import { cn, getInitials } from '../lib/utils';

/* ------------------------------------------------------------------ */
/* Botões                                                              */
/* ------------------------------------------------------------------ */

const BUTTON_VARIANTS = {
  primary:
    'bg-primary text-canvas hover:bg-primary-hover disabled:hover:bg-primary',
  secondary:
    'bg-elevated text-fg border border-line-strong hover:border-muted/40',
  ghost: 'text-muted hover:text-fg hover:bg-elevated',
  outline: 'border border-line-strong text-fg hover:bg-elevated',
  accent:
    'bg-accent/10 text-fg border border-accent/30 hover:bg-accent/20',
  danger: 'bg-accent-deep text-fg hover:bg-accent-deep/80',
};

const BUTTON_SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-xs gap-1.5',
  lg: 'h-9 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  active = false,
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        active
          ? 'bg-elevated text-primary'
          : 'text-muted hover:bg-elevated hover:text-fg',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, pontos de status e avatares                                 */
/* ------------------------------------------------------------------ */

const BADGE_VARIANTS = {
  neutral: 'bg-elevated text-muted',
  outline: 'border border-line-strong text-muted',
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/15 text-fg',
  solid: 'bg-primary text-canvas',
};

export function Badge({ variant = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-2xs font-medium',
        BADGE_VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Contador de não lidas — único uso de ciano sólido na lista. */
export function CountPill({ value, className }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-semibold tabular-nums text-canvas',
        className
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

const DOT_TONES = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  muted: 'bg-muted/60',
  secondary: 'bg-secondary',
};

export function StatusDot({ tone = 'muted', pulse = false, className }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        DOT_TONES[tone],
        pulse && 'animate-pulse',
        className
      )}
    />
  );
}

const AVATAR_SIZES = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-7 w-7 text-2xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

export function Avatar({ name, size = 'md', tone = 'neutral', className }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium',
        AVATAR_SIZES[size],
        tone === 'primary'
          ? 'bg-primary/15 text-primary'
          : tone === 'accent'
          ? 'bg-accent/20 text-fg'
          : 'bg-elevated text-muted',
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário                                                           */
/* ------------------------------------------------------------------ */

export const fieldClass =
  'w-full h-8 rounded-md border border-line-strong bg-canvas px-2.5 text-xs text-fg transition-colors focus:border-primary/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export const textareaClass =
  'w-full rounded-md border border-line-strong bg-canvas px-2.5 py-2 text-xs leading-relaxed text-fg transition-colors focus:border-primary/60 focus:outline-none';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && (
        <span className="block text-xs font-medium text-muted">{label}</span>
      )}
      {children}
      {hint && <span className="block text-2xs text-muted/80">{hint}</span>}
    </label>
  );
}

export function SectionLabel({ children, action, className }) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-xs font-medium text-muted">{children}</span>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Abas e controle segmentado                                           */
/* ------------------------------------------------------------------ */

export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-4', className)} role="tablist">
      {items.map((it) => {
        const Icon = it.icon;
        const active = value === it.id;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              'relative inline-flex h-full items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors',
              active ? 'text-fg' : 'text-muted hover:text-fg'
            )}
          >
            {Icon && <Icon size={13} />}
            <span>{it.label}</span>
            {it.count !== undefined && (
              <span className="tabular-nums text-muted">{it.count}</span>
            )}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-px bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ items, value, onChange, className }) {
  return (
    <div
      className={cn(
        'inline-flex h-7 items-center rounded-md border border-line bg-canvas p-0.5',
        className
      )}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            title={it.title || it.label}
            className={cn(
              'inline-flex h-full flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] px-2 text-2xs font-medium transition-colors',
              active ? 'bg-elevated text-fg' : 'text-muted hover:text-fg'
            )}
          >
            {Icon && <Icon size={12} className={it.iconClass} />}
            {it.label && <span>{it.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  as: Tag = 'div',
  onSubmit,
}) {
  const width =
    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : size === 'xl' ? 'max-w-5xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-canvas/80 p-4 backdrop-blur-[2px]">
      <Tag
        onSubmit={onSubmit}
        className={cn(
          'flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-card',
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <IconButton label="Fechar" size="sm" onClick={onClose}>
              <X size={15} />
            </IconButton>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">
            {footer}
          </div>
        )}
      </Tag>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted">
          <Icon size={16} />
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
          {description}
        </p>
      )}
    </div>
  );
}

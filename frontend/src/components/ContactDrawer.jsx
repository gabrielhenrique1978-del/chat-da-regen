import React, { useState } from 'react';
import {
  Phone,
  Mail,
  Plus,
  Flame,
  Sun,
  Snowflake,
  Clock,
  Shield,
  PanelRightClose,
  Download,
  Trash2,
  ShieldAlert,
  Instagram,
  MessageCircle,
  X,
  Pencil,
  Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Avatar, Badge, Button, IconButton, SectionLabel, Segmented, StatusDot, fieldClass } from './ui';

function Row({ icon: Icon, label, children, mono = false }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={14} className="shrink-0 text-muted" />
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      <span className={cn('min-w-0 flex-1 truncate text-xs text-fg', mono && 'tabular-nums')}>
        {children}
      </span>
    </div>
  );
}

function Section({ title, action, children, className }) {
  return (
    <section className={cn('space-y-2.5 border-b border-line px-4 py-4', className)}>
      <SectionLabel action={action}>{title}</SectionLabel>
      {children}
    </section>
  );
}

export default function ContactDrawer({
  contact,
  deal,
  stage,
  stages = [],
  sellers = [],
  windowInfo,
  canReassignSeller = true,
  onAssignSeller,
  onChangeTemperature,
  onAddTag,
  onMoveStage,
  onExportLgpd,
  onAnonymizeLgpd,
  onToggleConsent,
  onClose,
}) {
  const [newTag, setNewTag] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(contact?.phone || '');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const handleSavePhone = async () => {
    if (!phoneInput.trim()) return;
    setPhoneSaving(true);
    try {
      await api.updateContactDetails(contact.id, { phone: phoneInput.trim() });
      contact.phone = phoneInput.trim();
      setIsEditingPhone(false);
    } catch (err) {
      console.error('Erro ao atualizar telefone:', err);
    } finally {
      setPhoneSaving(false);
    }
  };

  if (!contact) return null;

  const handleTagSubmit = (e) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    onAddTag(newTag.trim());
    setNewTag('');
  };

  const currentSellerObj = sellers.find(
    (s) => s.id === contact.seller_id || s.name === contact.assignee
  );

  const ChannelIcon = contact.channel === 'instagram' ? Instagram : MessageCircle;
  const consent = contact.consent_status;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface text-fg">
      {/* Cabeçalho */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-medium text-fg">Detalhes</span>
        {onClose && (
          <IconButton label="Recolher painel" size="sm" onClick={onClose}>
            <PanelRightClose size={16} />
          </IconButton>
        )}
      </div>

      {/* Identificação */}
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} size="lg" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-fg">{contact.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-muted">
              <ChannelIcon size={12} />
              {contact.channel}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-3">
              <Phone size={14} className="shrink-0 text-muted" />
              <span className="w-14 shrink-0 text-xs text-muted">Telefone</span>
            </div>
            {isEditingPhone ? (
              <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full rounded border border-line bg-canvas px-2 py-0.5 text-xs text-fg focus:outline-none focus:border-primary"
                  placeholder="+55 19 99999-9999"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSavePhone}
                  disabled={phoneSaving}
                  className="rounded p-1 text-primary hover:bg-surface-hover"
                  title="Salvar"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  className="rounded p-1 text-muted hover:bg-surface-hover"
                  title="Cancelar"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg font-mono">
                  {contact.phone || <span className="text-muted">—</span>}
                </span>
                {contact.phone && contact.phone.replace(/\D/g, '').length > 13 && (
                  <span className="rounded bg-primary/10 px-1 py-0.5 text-3xs text-primary font-medium" title="Identificador Meta LID">
                    Meta LID
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPhoneInput(contact.phone || '');
                    setIsEditingPhone(true);
                  }}
                  className="text-muted hover:text-fg p-0.5 rounded transition-colors"
                  title="Editar telefone real"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
          </div>
          <Row icon={Mail} label="E-mail">
            {contact.email || <span className="text-muted">—</span>}
          </Row>
        </div>
      </div>

      {/* Responsável */}
      <Section title="Responsável">
        <select
          aria-label="Vendedor responsável"
          disabled={!canReassignSeller}
          value={currentSellerObj?.id || contact.assignee || 'Agente IA'}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'Agente IA') {
              onAssignSeller({
                assignee: 'Agente IA',
                seller_id: null,
                ai_enabled: true,
                attendance_status: 'bot',
              });
            } else {
              const found = sellers.find((s) => s.id === val || s.name === val);
              if (found) {
                onAssignSeller({
                  assignee: found.name,
                  seller_id: found.id,
                  ai_enabled: false,
                  attendance_status: 'human',
                });
              }
            }
          }}
          className={fieldClass}
        >
          <option value="Agente IA">Agente IA (automático)</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-2xs leading-relaxed text-muted">
          Ao atribuir, a conversa fica exclusiva do vendedor.
        </p>
      </Section>

      {/* Negócio */}
      <Section
        title="Negócio"
        action={
          deal && (
            <span className="text-xs font-medium tabular-nums text-fg">
              <span className="text-muted">R$ </span>
              {Number(deal.value || 0).toLocaleString('pt-BR')}
            </span>
          )
        }
      >
        {deal && stages.length > 0 ? (
          <select
            aria-label="Etapa do funil"
            value={stage?.id || deal.stage_id || ''}
            onChange={(e) => onMoveStage(deal.id, e.target.value, deal.value)}
            className={fieldClass}
          >
            {stages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted">Nenhum negócio vinculado.</p>
        )}
      </Section>

      {/* Qualificação */}
      <Section
        title="Qualificação"
        action={
          <span className="text-2xs tabular-nums text-muted">
            Score <span className="font-medium text-fg">{contact.lead_score || 50}</span>/100
          </span>
        }
      >
        <Segmented
          className="w-full"
          value={contact.temperature}
          onChange={(id) => onChangeTemperature(id)}
          items={[
            {
              id: 'hot',
              label: 'Quente',
              icon: Flame,
              iconClass: contact.temperature === 'hot' ? 'text-primary' : '',
            },
            {
              id: 'warm',
              label: 'Morno',
              icon: Sun,
              iconClass: contact.temperature === 'warm' ? 'text-accent' : '',
            },
            { id: 'cold', label: 'Frio', icon: Snowflake },
          ]}
        />
      </Section>

      {/* Tags */}
      <Section title="Tags">
        {(contact.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <form onSubmit={handleTagSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Adicionar tag"
            className={fieldClass}
          />
          <IconButton
            type="submit"
            label="Adicionar tag"
            disabled={!newTag.trim()}
            className="border border-line-strong"
          >
            <Plus size={14} />
          </IconButton>
        </form>
      </Section>

      {/* Janela de 24h */}
      {windowInfo && (
        <Section title="Janela Meta (24h)">
          <div className="flex items-start gap-2 text-xs leading-relaxed">
            <Clock
              size={14}
              className={cn('mt-0.5 shrink-0', windowInfo.window_open ? 'text-primary' : 'text-accent')}
            />
            <span className={windowInfo.window_open ? 'text-fg' : 'text-muted'}>
              {windowInfo.reason}
            </span>
          </div>
        </Section>
      )}

      {/* Privacidade (LGPD) */}
      <Section
        title="Privacidade (LGPD)"
        className="border-b-0"
        action={
          <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
            <StatusDot
              tone={consent === 'anonymized' ? 'muted' : consent === 'opted_out' ? 'accent' : 'primary'}
            />
            {consent === 'opted_out'
              ? 'Opt-out'
              : consent === 'anonymized'
              ? 'Anonimizado'
              : 'Consentimento ativo'}
          </span>
        }
      >
        <div className="space-y-1">
          {onToggleConsent && consent !== 'anonymized' && (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() =>
                onToggleConsent(contact.id, consent === 'opted_out' ? 'opted_in' : 'opted_out')
              }
            >
              <Shield size={13} />
              {consent === 'opted_out' ? 'Reativar consentimento' : 'Registrar opt-out'}
            </Button>
          )}

          {onExportLgpd && (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportLgpd(contact.id)}
            >
              <Download size={13} />
              Exportar dados (JSON)
            </Button>
          )}

          {onAnonymizeLgpd && consent !== 'anonymized' && !confirmErase && (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setConfirmErase(true)}
            >
              <Trash2 size={13} />
              Anonimizar titular
            </Button>
          )}
        </div>

        {onAnonymizeLgpd && consent !== 'anonymized' && confirmErase && (
          <div className="space-y-2.5 rounded-lg border border-accent/30 bg-accent-deep/20 p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-fg">Anonimizar de forma irreversível?</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                  Nome, telefone, e-mail e histórico serão apagados permanentemente.
                </p>
              </div>
              <IconButton label="Cancelar" size="sm" onClick={() => setConfirmErase(false)}>
                <X size={13} />
              </IconButton>
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmErase(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={async () => {
                  await onAnonymizeLgpd(contact.id);
                  setConfirmErase(false);
                }}
              >
                Anonimizar
              </Button>
            </div>
          </div>
        )}

        <p className="flex items-center gap-1.5 pt-1 text-2xs text-muted/70">
          <Shield size={11} />
          AES-256 em repouso · índice cego HMAC
        </p>
      </Section>
    </aside>
  );
}

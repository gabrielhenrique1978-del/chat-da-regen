import React, { useState } from 'react';
import {
  Phone,
  Mail,
  Tag,
  Plus,
  Flame,
  Sun,
  Snowflake,
  UserCheck,
  Briefcase,
  Clock,
  Shield,
  ChevronRight,
  Download,
  Trash2,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { cn, getInitials } from '../lib/utils';

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

  return (
    <aside className="w-72 xl:w-80 h-full border-l border-[#1E293B] bg-[#121824] text-[#F8FAFC] flex flex-col shrink-0 overflow-y-auto">
      {/* Cabeçalho da Gaveta (Alinhado em h-16 com as demais colunas) */}
      <div className="h-16 px-4 border-b border-[#1E293B] bg-[#121824] flex items-center justify-between shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
          Detalhes do Lead & CRM
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333] transition"
            title="Recolher gaveta lateral"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Perfil do Contato */}
      <div className="p-5 border-b border-[#1E293B] flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#1B2333] border border-[#1E293B] text-[#00D2FF] flex items-center justify-center text-lg font-bold mb-3 shadow-subtle">
          {getInitials(contact.name)}
        </div>
        <h3 className="font-semibold text-sm text-[#F8FAFC]">
          {contact.name}
        </h3>
        <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#0A0D14] border border-[#1E293B] text-[#94A3B8] uppercase">
          {contact.channel}
        </span>

        <div className="w-full mt-4 space-y-2 text-left text-xs">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-[#F8FAFC]">
            <Phone size={14} className="text-[#00D2FF] shrink-0" />
            <span className="truncate font-mono">
              {contact.phone || 'Sem telefone'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-[#F8FAFC]">
            <Mail size={14} className="text-[#00D2FF] shrink-0" />
            <span className="truncate">
              {contact.email || 'E-mail não informado'}
            </span>
          </div>
        </div>
      </div>

      {/* Seletor Dinâmico do Vendedor Responsável (Alimentado por GET /api/sellers) */}
      <div className="p-4 border-b border-[#1E293B] space-y-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          <UserCheck size={14} className="text-[#00D2FF]" />
          Vendedor Responsável (Posse)
        </label>
        <select
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
          className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3 py-2 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <option value="Agente IA">🤖 Agente IA (Automático)</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              👤 {s.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-[#94A3B8]">
          Ao atribuir a um vendedor, o chat fica exclusivo para ele e bloqueado
          para os demais colegas.
        </p>
      </div>

      {/* Etapa do Funil CRM */}
      <div className="p-4 border-b border-[#1E293B] space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            <Briefcase size={14} className="text-[#00D2FF]" />
            Etapa do Funil CRM
          </label>
          {deal && (
            <span className="text-xs font-bold text-[#00D2FF]">
              R$ {Number(deal.value || 0).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        {deal && stages.length > 0 ? (
          <select
            value={stage?.id || deal.stage_id || ''}
            onChange={(e) => onMoveStage(deal.id, e.target.value, deal.value)}
            className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3 py-2 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF] transition"
          >
            {stages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-[#94A3B8] italic">
            Sem negócio ativo vinculado
          </div>
        )}
      </div>

      {/* Temperatura & Lead Score */}
      <div className="p-4 border-b border-[#1E293B] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Qualificação / Temperatura
          </span>
          <span className="text-xs font-semibold text-[#00D2FF]">
            Score: {contact.lead_score || 50}/100
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'hot', label: 'Quente', icon: Flame, color: 'text-rose-400 bg-rose-950/40 border-rose-500/40' },
            { id: 'warm', label: 'Morno', icon: Sun, color: 'text-amber-300 bg-amber-950/40 border-amber-500/40' },
            { id: 'cold', label: 'Frio', icon: Snowflake, color: 'text-[#00D2FF] bg-[#1B2333] border-[#00D2FF]/40' },
          ].map((temp) => {
            const Icon = temp.icon;
            const active = contact.temperature === temp.id;
            return (
              <button
                key={temp.id}
                onClick={() => onChangeTemperature(temp.id)}
                className={cn(
                  'flex flex-col items-center justify-center py-2 px-2 rounded-xl border text-[11px] font-semibold transition',
                  active
                    ? temp.color
                    : 'border-[#1E293B] bg-[#0A0D14] text-[#94A3B8] hover:bg-[#1B2333] hover:text-[#F8FAFC]'
                )}
              >
                <Icon size={15} className="mb-1" />
                {temp.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags do Contato */}
      <div className="p-4 border-b border-[#1E293B] space-y-2.5">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          <Tag size={14} className="text-[#00D2FF]" />
          Tags do Cliente
        </label>

        <div className="flex flex-wrap gap-1.5">
          {(contact.tags || []).map((t) => (
            <span
              key={t}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1B2333] text-[#00D2FF] border border-[#00D2FF]/20"
            >
              #{t}
            </span>
          ))}
        </div>

        <form onSubmit={handleTagSubmit} className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Nova tag (ex: vip)..."
            className="flex-1 rounded-xl border border-[#1E293B] bg-[#0A0D14] px-2.5 py-1.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold flex items-center transition"
          >
            <Plus size={14} />
          </button>
        </form>
      </div>

      {/* Status da Janela Oficial de 24h da Meta */}
      {windowInfo && (
        <div className="p-4 border-b border-[#1E293B] space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            <Clock size={14} className="text-[#00D2FF]" />
            Janela Oficial Meta (24h)
          </div>
          <div
            className={cn(
              'p-2.5 rounded-xl border text-xs',
              windowInfo.window_open
                ? 'bg-[#1B2333] border-[#1E293B] text-[#F8FAFC]'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            )}
          >
            {windowInfo.reason}
          </div>
        </div>
      )}

      {/* Governança LGPD & Direitos do Titular (Art. 18, Lei 13.709/2018) */}
      <div className="p-4 space-y-3 bg-[#0A0D14]/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#F8FAFC]">
            <Shield size={14} className="text-[#00D2FF]" />
            Privacidade & LGPD
          </div>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border',
              contact.consent_status === 'opted_out'
                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                : contact.consent_status === 'anonymized'
                ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                : 'bg-[#1B2333] text-[#00D2FF] border-[#00D2FF]/30'
            )}
          >
            {contact.consent_status === 'opted_out'
              ? 'Opt-Out (Bloqueado)'
              : contact.consent_status === 'anonymized'
              ? 'Anonimizado'
              : 'Consentimento Ativo'}
          </span>
        </div>

        {/* Toggle de Consentimento (Opt-In / Opt-Out de Campanhas) */}
        {onToggleConsent && contact.consent_status !== 'anonymized' && (
          <button
            type="button"
            onClick={() =>
              onToggleConsent(
                contact.id,
                contact.consent_status === 'opted_out'
                  ? 'opted_in'
                  : 'opted_out'
              )
            }
            className="w-full py-2 px-3 rounded-xl border border-[#1E293B] bg-[#121824] hover:bg-[#1B2333] text-[11px] font-semibold text-[#F8FAFC] flex items-center justify-center gap-1.5 transition"
          >
            <CheckCircle2 size={13} className="text-[#00D2FF]" />
            <span>
              {contact.consent_status === 'opted_out'
                ? 'Reativar Consentimento (Opt-In)'
                : 'Registrar Opt-Out (Bloquear Campanhas)'}
            </span>
          </button>
        )}

        {/* Exportar Dossiê de Portabilidade (Art. 18, V) */}
        {onExportLgpd && (
          <button
            type="button"
            onClick={() => onExportLgpd(contact.id)}
            className="w-full py-2 px-3 rounded-xl border border-[#1E293B] bg-[#1B2333] hover:bg-[#1B2333]/80 text-[11px] font-semibold text-[#F8FAFC] flex items-center justify-center gap-1.5 transition"
          >
            <Download size={13} className="text-[#00D2FF]" />
            <span>Exportar Dossiê LGPD (JSON)</span>
          </button>
        )}

        {/* Direito ao Esquecimento / Anonimização Irreversível (Art. 18, VI) */}
        {onAnonymizeLgpd && contact.consent_status !== 'anonymized' && (
          <>
            {!confirmErase ? (
              <button
                type="button"
                onClick={() => setConfirmErase(true)}
                className="w-full py-2 px-3 rounded-xl border border-rose-500/20 bg-rose-950/20 hover:bg-rose-950/40 text-[11px] font-semibold text-rose-300 flex items-center justify-center gap-1.5 transition"
              >
                <Trash2 size={13} />
                <span>Anonimizar Titular (Esquecimento)</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 space-y-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-rose-200">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>Confirmar exclusão LGPD irreversível?</span>
                </div>
                <p className="text-[10px] text-rose-300">
                  O nome, telefone, e-mail e histórico de mensagens serão
                  apagados permanentemente.
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmErase(false)}
                    className="flex-1 py-1.5 rounded-lg border border-[#1E293B] bg-[#121824] text-[#F8FAFC] font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onAnonymizeLgpd(contact.id);
                      setConfirmErase(false);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-1 text-[10px] text-[#94A3B8] pt-1">
          <Shield size={11} className="text-[#00D2FF] shrink-0" />
          <span>Criptografia AES-256 + Blind Index HMAC</span>
        </div>
      </div>
    </aside>
  );
}

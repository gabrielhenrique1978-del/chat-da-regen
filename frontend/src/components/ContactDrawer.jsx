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
    <aside className="w-72 xl:w-80 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 overflow-y-auto">
      {/* Cabeçalho da Gaveta (Alinhado em h-16 com as demais colunas) */}
      <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Detalhes do Lead & CRM
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Recolher gaveta lateral"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Perfil do Contato */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-700/10 dark:bg-emerald-500/10 border border-emerald-600/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xl font-extrabold mb-3">
          {getInitials(contact.name)}
        </div>
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          {contact.name}
        </h3>
        <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
          {contact.channel}
        </span>

        <div className="w-full mt-4 space-y-2 text-left text-xs">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
            <Phone size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate font-mono">
              {contact.phone || 'Sem telefone'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
            <Mail size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate">
              {contact.email || 'E-mail não informado'}
            </span>
          </div>
        </div>
      </div>

      {/* Seletor Dinâmico do Vendedor Responsável (Alimentado por GET /api/sellers) */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <UserCheck size={14} className="text-emerald-600" />
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
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="Agente IA">🤖 Agente IA (Automático)</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              👤 {s.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Ao atribuir a um vendedor, o chat fica exclusivo para ele e bloqueado
          para os demais colegas.
        </p>
      </div>

      {/* Etapa do Funil CRM */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Briefcase size={14} className="text-emerald-600" />
            Etapa do Funil CRM
          </label>
          {deal && (
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
              R$ {Number(deal.value || 0).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        {deal && stages.length > 0 ? (
          <select
            value={stage?.id || deal.stage_id || ''}
            onChange={(e) => onMoveStage(deal.id, e.target.value, deal.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
          >
            {stages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-slate-400 italic">
            Sem negócio ativo vinculado
          </div>
        )}
      </div>

      {/* Temperatura & Lead Score */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Qualificação / Temperatura
          </span>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Score: {contact.lead_score || 50}/100
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'hot', label: 'Quente', icon: Flame, color: 'text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800' },
            { id: 'warm', label: 'Morno', icon: Sun, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' },
            { id: 'cold', label: 'Frio', icon: Snowflake, color: 'text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800' },
          ].map((temp) => {
            const Icon = temp.icon;
            const active = contact.temperature === temp.id;
            return (
              <button
                key={temp.id}
                onClick={() => onChangeTemperature(temp.id)}
                className={cn(
                  'flex flex-col items-center justify-center py-2 px-2 rounded-xl border text-[11px] font-bold transition',
                  active
                    ? temp.color
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
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
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Tag size={14} className="text-emerald-600" />
          Tags do Cliente
        </label>

        <div className="flex flex-wrap gap-1.5">
          {(contact.tags || []).map((t) => (
            <span
              key={t}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
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
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center"
          >
            <Plus size={14} />
          </button>
        </form>
      </div>

      {/* Status da Janela Oficial de 24h da Meta */}
      {windowInfo && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Clock size={14} className="text-blue-600" />
            Janela Oficial Meta (24h)
          </div>
          <div
            className={cn(
              'p-2.5 rounded-xl border text-xs',
              windowInfo.window_open
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            )}
          >
            {windowInfo.reason}
          </div>
        </div>
      )}

      {/* Governança LGPD & Direitos do Titular (Art. 18, Lei 13.709/2018) */}
      <div className="p-4 space-y-3 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <Shield size={14} className="text-emerald-600" />
            Privacidade & LGPD (Art. 18)
          </div>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase',
              contact.consent_status === 'opted_out'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                : contact.consent_status === 'anonymized'
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
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
            className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition"
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
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
            className="w-full py-2 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 text-[11px] font-bold text-indigo-800 dark:text-indigo-200 flex items-center justify-center gap-1.5 transition"
          >
            <Download size={13} />
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
                className="w-full py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100 text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center justify-center gap-1.5 transition"
              >
                <Trash2 size={13} />
                <span>Anonimizar Titular (Esquecimento)</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 space-y-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-200">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>Confirmar exclusão LGPD irreversível?</span>
                </div>
                <p className="text-[10px] text-rose-700 dark:text-rose-300">
                  O nome, telefone, e-mail e histórico de mensagens serão
                  apagados permanentemente.
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmErase(false)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
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

        <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1">
          <Shield size={11} className="text-emerald-600 shrink-0" />
          <span>Criptografia AES-256 + Blind Index HMAC ativo</span>
        </div>
      </div>
    </aside>
  );
}

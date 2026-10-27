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
  onClose,
}) {
  const [newTag, setNewTag] = useState('');

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
    <aside className="w-80 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 overflow-y-auto">
      {/* Cabeçalho da Gaveta */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
        <div className="p-4 space-y-1.5">
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
          <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1">
            <Shield size={11} className="text-emerald-600" />
            <span>Dados protegidos com AES-256 no Neon Cloud</span>
          </div>
        </div>
      )}
    </aside>
  );
}

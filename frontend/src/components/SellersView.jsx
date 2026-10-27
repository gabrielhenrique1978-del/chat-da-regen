import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit3,
  UserCheck,
  UserX,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn, getInitials } from '../lib/utils';

export default function SellersView({ onSellersUpdated }) {
  const [allSellers, setAllSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState(null);

  const fetchAllSellers = async () => {
    setLoading(true);
    try {
      const data = await api.getSellers(true);
      setAllSellers(data.sellers || []);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSellers();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPhone('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedback({ type: 'error', text: 'O nome do vendedor é obrigatório.' });
      return;
    }
    try {
      if (editingId) {
        await api.updateSeller(editingId, {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
        });
        setFeedback({
          type: 'success',
          text: `Vendedor '${name.trim()}' atualizado com sucesso!`,
        });
      } else {
        await api.createSeller({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
        });
        setFeedback({
          type: 'success',
          text: `Vendedor '${name.trim()}' cadastrado na equipe!`,
        });
      }
      resetForm();
      await fetchAllSellers();
      onSellersUpdated?.();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleToggleActive = async (seller) => {
    const newActive = !seller.active;
    try {
      await api.updateSeller(seller.id, { active: newActive });
      setFeedback({
        type: 'success',
        text: `Status de '${seller.name}' alterado para ${
          newActive ? 'Ativo' : 'Desativado (Soft Delete)'
        }.`,
      });
      await fetchAllSellers();
      onSellersUpdated?.();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const startEdit = (seller) => {
    setEditingId(seller.id);
    setName(seller.name);
    setEmail(seller.email || '');
    setPhone(seller.phone || '');
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="text-emerald-600" size={24} />
            Gestão Dinâmica de Vendedores & Equipe
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cadastre, edite e ative/desative colaboradores com Soft Delete
            (preservando todo o histórico de conversas no Neon PostgreSQL).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2 rounded-xl">
          <ShieldCheck size={16} />
          <span>
            {allSellers.filter((s) => s.active).length} ativos de{' '}
            {allSellers.length} cadastrados
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between',
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
          )}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Formulário de Cadastro / Edição */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <UserPlus size={15} />
            {editingId ? 'Editar Vendedor' : 'Cadastrar Novo Vendedor'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-500 hover:underline"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Camila Santos"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              E-mail (Opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="camila@loja.com"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Telefone / WhatsApp (Opcional)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
          >
            {editingId ? 'Salvar Alterações' : 'Adicionar Vendedor à Equipe'}
          </button>
        </div>
      </form>

      {/* Listagem de Vendedores */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="font-bold text-xs text-slate-700 dark:text-slate-200">
            Membros Cadastrados ({allSellers.length})
          </span>
          <span className="text-[11px] text-slate-400">
            Vendedores desativados não aparecem nos dropdowns ativos, mas
            mantêm o histórico intacto.
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Carregando equipe...
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {allSellers.map((s) => (
              <div
                key={s.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0',
                      s.active
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    )}
                  >
                    {getInitials(s.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'font-bold text-sm',
                          s.active
                            ? 'text-slate-900 dark:text-white'
                            : 'line-through text-slate-400'
                        )}
                      >
                        {s.name}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          s.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}
                      >
                        {s.active ? 'Ativo' : 'Desativado'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {s.email || 'Sem e-mail'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {s.phone || 'Sem telefone'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <Edit3 size={13} />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={() => handleToggleActive(s)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition',
                      s.active
                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                    )}
                  >
                    {s.active ? (
                      <>
                        <UserX size={13} />
                        <span>Desativar</span>
                      </>
                    ) : (
                      <>
                        <UserCheck size={13} />
                        <span>Reativar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

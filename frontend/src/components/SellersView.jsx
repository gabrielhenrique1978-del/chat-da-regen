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
  Eye,
  KeyRound,
  Lock,
  Crown,
  MessageSquare,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn, getInitials } from '../lib/utils';

export default function SellersView({
  contacts = [],
  activeSeller,
  isSupervisorMode = true,
  impersonatedSeller,
  onImpersonateSeller,
  onLockToSeller,
  onOpenPinModal,
  onSellersUpdated,
}) {
  const [allSellers, setAllSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('1234');
  const [role, setRole] = useState('seller');
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
    setPin('1234');
    setRole('seller');
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
          pin: pin.trim() || '1234',
          role,
        });
        setFeedback({
          type: 'success',
          text: `Dados e credenciais de '${name.trim()}' atualizados com sucesso!`,
        });
      } else {
        await api.createSeller({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          pin: pin.trim() || '1234',
          role,
        });
        setFeedback({
          type: 'success',
          text: `Colaborador '${name.trim()}' cadastrado com PIN individual!`,
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
    setPin(seller.pin || '1234');
    setRole(seller.role || 'seller');
  };

  const getSellerChatCount = (seller) => {
    return contacts.filter(
      (c) =>
        (c.attendance_status === 'human' || c.ai_enabled === false) &&
        (c.seller_id === seller.id ||
          (c.assignee || '').toLowerCase() === seller.name.toLowerCase())
    ).length;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-[#0A0D14] text-[#F8FAFC] space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F8FAFC] flex items-center gap-2.5">
            <Users className="text-[#00D2FF]" size={22} />
            Gestão de Vendedores, PIN Individual & Supervisão
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Cada vendedor possui seu próprio PIN para travar sua sessão. Como{' '}
            <strong className="text-[#F8FAFC]">Supervisor</strong>, você pode entrar na conta de qualquer
            vendedor em 1 clique para auditar atendimentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#00D2FF] bg-[#121824] border border-[#1E293B] px-3.5 py-2 rounded-xl">
            <ShieldCheck size={16} />
            <span>
              {allSellers.filter((s) => s.active).length} ativos de{' '}
              {allSellers.length}
            </span>
          </div>
        </div>
      </div>

      {/* Aviso quando está em Modo Vendedor Travado */}
      {!isSupervisorMode && (
        <div className="p-4 rounded-2xl bg-[#121824] border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-amber-200">
            <Lock size={18} className="text-amber-400 shrink-0" />
            <div>
              <strong>
                Sessão Travada no Vendedor ({activeSeller?.name}):
              </strong>{' '}
              Você está operando exclusivamente com seu próprio nome. Para
              entrar na conta de outros vendedores ou editar a equipe, ative o{' '}
              <strong>Modo Supervisor</strong>.
            </div>
          </div>
          {onOpenPinModal && (
            <button
              onClick={onOpenPinModal}
              className="px-3.5 py-2 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold shrink-0 flex items-center gap-1.5 transition"
            >
              <KeyRound size={14} />
              <span>Desbloquear Supervisor</span>
            </button>
          )}
        </div>
      )}

      {feedback && (
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between',
            feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : 'bg-[#1B2333] border border-[#00D2FF]/30 text-[#00D2FF]'
          )}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Formulário de Cadastro / Edição (Visível para Supervisor) */}
      {isSupervisorMode && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 shadow-card space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#00D2FF] flex items-center gap-1.5">
              <UserPlus size={15} />
              {editingId
                ? 'Editar Vendedor / Credenciais'
                : 'Cadastrar Novo Vendedor ou Supervisor'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-[#94A3B8] hover:text-[#00D2FF] hover:underline"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="lg:col-span-1">
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Camila Santos"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                Perfil / Cargo
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3 py-2 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
              >
                <option value="seller">🎧 Vendedor (Apenas Próprio Nome)</option>
                <option value="supervisor">
                  👑 Supervisor (Acessa Todas as Contas)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                PIN Individual (Senha) *
              </label>
              <input
                type="text"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Ex: 1234"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3.5 py-2 text-xs font-mono font-bold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                E-mail (Opcional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="camila@loja.com"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#94A3B8] mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold transition shadow-xs"
            >
              {editingId ? 'Salvar Alterações' : 'Adicionar Membro à Equipe'}
            </button>
          </div>
        </form>
      )}

      {/* Listagem de Vendedores & Acesso do Supervisor às Contas */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl overflow-hidden shadow-card">
        <div className="px-5 py-3.5 border-b border-[#1E293B] bg-[#0A0D14]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="font-semibold text-xs text-[#F8FAFC]">
            Equipe Cadastrada ({allSellers.length})
          </span>
          <span className="text-[11px] text-[#94A3B8]">
            {isSupervisorMode
              ? 'Clique em "Entrar na Conta" para auditar atendimentos do vendedor em tempo real.'
              : 'Sessão protegida por PIN individual.'}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#94A3B8]">
            Carregando equipe...
          </div>
        ) : (
          <div className="divide-y divide-[#1E293B]/60">
            {allSellers.map((s) => {
              const activeChatsCount = getSellerChatCount(s);
              const isBeingImpersonated = impersonatedSeller?.id === s.id;
              const isLockedCurrent =
                !isSupervisorMode && activeSeller?.id === s.id;

              return (
                <div
                  key={s.id}
                  className={cn(
                    'p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#1B2333]/50 transition',
                    isBeingImpersonated &&
                      'bg-[#1B2333] border-l-2 border-l-amber-500'
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0',
                        !s.active
                          ? 'bg-[#0A0D14] text-[#94A3B8] border border-[#1E293B]'
                          : s.role === 'supervisor'
                          ? 'bg-gradient-to-br from-[#6366F1] to-[#4C1D95] text-white'
                          : 'bg-[#1B2333] border border-[#1E293B] text-[#00D2FF]'
                      )}
                    >
                      {getInitials(s.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'font-semibold text-sm',
                            s.active
                              ? 'text-[#F8FAFC]'
                              : 'line-through text-[#94A3B8]'
                          )}
                        >
                          {s.name}
                        </span>

                        {/* Role Badge */}
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border',
                            s.role === 'supervisor'
                              ? 'bg-[#1B2333] text-[#A5B4FC] border-[#6366F1]/40'
                              : 'bg-[#1B2333] text-[#00D2FF] border-[#00D2FF]/30'
                          )}
                        >
                          {s.role === 'supervisor' ? (
                            <>
                              <Crown size={10} /> Supervisor
                            </>
                          ) : (
                            'Vendedor'
                          )}
                        </span>

                        {/* Active / Inactive Badge */}
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-medium border',
                            s.active
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                              : 'bg-[#0A0D14] text-[#94A3B8] border-[#1E293B]'
                          )}
                        >
                          {s.active ? 'Ativo' : 'Desativado'}
                        </span>

                        {/* Live Workload Badge */}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#0A0D14] border border-[#1E293B] text-[#94A3B8] inline-flex items-center gap-1">
                          <MessageSquare size={10} className="text-[#00D2FF]" />
                          {activeChatsCount} em atendimento
                        </span>

                        {isSupervisorMode && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#0A0D14] border border-[#1E293B] text-[#94A3B8]">
                            PIN: {s.pin || '••••'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[#94A3B8] mt-1">
                        <span className="flex items-center gap-1">
                          <Mail size={12} className="text-[#00D2FF]" /> {s.email || 'Sem e-mail'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone size={12} className="text-[#00D2FF]" /> {s.phone || 'Sem telefone'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações de Supervisão, Impersonation e Gestão */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isSupervisorMode && s.active && (
                      <>
                        <button
                          onClick={() => onImpersonateSeller?.(s, true)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition',
                            isBeingImpersonated
                              ? 'bg-amber-600 text-white'
                              : 'bg-[#1B2333] hover:bg-[#6366F1]/20 border border-[#6366F1]/40 text-[#A5B4FC]'
                          )}
                          title={`Entrar na conta de ${s.name} como Supervisor para ver e auditar os atendimentos`}
                        >
                          <Eye size={13} className="text-[#6366F1]" />
                          <span>
                            {isBeingImpersonated
                              ? 'Espelhando Conta'
                              : 'Entrar na Conta'}
                          </span>
                        </button>

                        <button
                          onClick={() => onLockToSeller?.(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-[#94A3B8] hover:text-[#00D2FF] hover:border-[#00D2FF]/30 text-xs font-semibold transition"
                          title={`Travar tela exclusivamente no modo Vendedor de ${s.name}`}
                        >
                          <Lock size={12} />
                          <span>Travar como {s.name.split(' ')[0]}</span>
                        </button>
                      </>
                    )}

                    {isLockedCurrent && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 text-xs font-semibold">
                        <Lock size={12} /> Sua Conta Ativa
                      </span>
                    )}

                    {isSupervisorMode && (
                      <>
                        <button
                          onClick={() => startEdit(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1B2333] transition"
                        >
                          <Edit3 size={13} />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleToggleActive(s)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition',
                            s.active
                              ? 'border-amber-500/30 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40'
                              : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

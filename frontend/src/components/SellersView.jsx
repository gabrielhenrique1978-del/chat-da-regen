import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Pencil,
  UserCheck,
  UserX,
  Eye,
  KeyRound,
  Lock,
  Crown,
  X,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Avatar, Badge, Button, EmptyState, Field, IconButton, StatusDot, fieldClass } from './ui';

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
        const cleanPin = pin.trim();
        await api.updateSeller(editingId, {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          ...(cleanPin && cleanPin !== '••••' ? { pin: cleanPin } : {}),
          role,
        });
        setFeedback({ type: 'success', text: `Dados de ${name.trim()} atualizados.` });
      } else {
        await api.createSeller({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          pin: pin.trim() || '1234',
          role,
        });
        setFeedback({ type: 'success', text: `${name.trim()} adicionado à equipe.` });
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
        text: `${seller.name} ${newActive ? 'reativado' : 'desativado'}.`,
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
    setPin('');
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

  const activeCount = allSellers.filter((s) => s.active).length;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-canvas text-fg">
      {/* Cabeçalho da página */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-fg">Equipe</h1>
          <span className="text-xs tabular-nums text-muted">
            {activeCount} ativos de {allSellers.length}
          </span>
        </div>
        {!isSupervisorMode && onOpenPinModal && (
          <Button variant="secondary" onClick={onOpenPinModal}>
            <KeyRound size={13} />
            Entrar como supervisor
          </Button>
        )}
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* Aviso de sessão travada */}
        {!isSupervisorMode && (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <Lock size={14} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-xs leading-relaxed text-muted">
              Sessão pessoal de <span className="font-medium text-fg">{activeSeller?.name}</span>.
              Para gerenciar a equipe ou espelhar outras contas, entre como supervisor.
            </p>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs',
              feedback.type === 'error'
                ? 'border-accent/30 bg-accent-deep/20 text-fg'
                : 'border-line bg-surface text-fg'
            )}
          >
            <span className="flex items-center gap-2">
              <StatusDot tone={feedback.type === 'error' ? 'accent' : 'primary'} />
              {feedback.text}
            </span>
            <IconButton label="Fechar" size="sm" onClick={() => setFeedback(null)}>
              <X size={13} />
            </IconButton>
          </div>
        )}

        {/* Formulário */}
        {isSupervisorMode && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-medium text-fg">
                <UserPlus size={14} className="text-muted" />
                {editingId ? 'Editar membro' : 'Novo membro'}
              </h2>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancelar edição
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Nome completo">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Camila Santos"
                  className={fieldClass}
                />
              </Field>
              <Field label="Função">
                <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
                  <option value="seller">Vendedor — apenas a própria conta</option>
                  <option value="supervisor">Supervisor — todas as contas</option>
                </select>
              </Field>
              <Field label="PIN de acesso">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="1234"
                  className={cn(fieldClass, 'font-mono tracking-widest')}
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="camila@empresa.com"
                  className={fieldClass}
                />
              </Field>
              <Field label="Telefone">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className={fieldClass}
                />
              </Field>
            </div>

            <div className="flex justify-end border-t border-line px-4 py-3">
              <Button type="submit" variant="primary">
                {editingId ? 'Salvar alterações' : 'Adicionar membro'}
              </Button>
            </div>
          </form>
        )}

        {/* Tabela */}
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {loading ? (
            <div className="space-y-px">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse bg-elevated/30" />
              ))}
            </div>
          ) : allSellers.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum membro cadastrado" description="Adicione o primeiro vendedor pelo formulário acima." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-line text-2xs font-medium text-muted">
                    <th className="px-4 py-2.5 font-medium">Membro</th>
                    <th className="px-4 py-2.5 font-medium">Função</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Atendimentos</th>
                    {isSupervisorMode && <th className="px-4 py-2.5 font-medium">PIN</th>}
                    <th className="px-4 py-2.5 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {allSellers.map((s) => {
                    const activeChatsCount = getSellerChatCount(s);
                    const isBeingImpersonated = impersonatedSeller?.id === s.id;
                    const isLockedCurrent = !isSupervisorMode && activeSeller?.id === s.id;

                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'group transition-colors hover:bg-elevated/40',
                          isBeingImpersonated && 'bg-accent/[0.06]'
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={s.name}
                              size="sm"
                              tone={!s.active ? 'neutral' : s.role === 'supervisor' ? 'accent' : 'primary'}
                            />
                            <div className="min-w-0">
                              <p className={cn('truncate text-[13px] font-medium', s.active ? 'text-fg' : 'text-muted line-through')}>
                                {s.name}
                              </p>
                              <p className="truncate text-2xs text-muted">
                                {[s.email, s.phone].filter(Boolean).join(' · ') || 'Sem contato'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {s.role === 'supervisor' ? (
                            <Badge variant="accent">
                              <Crown size={10} /> Supervisor
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted">Vendedor</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <StatusDot tone={s.active ? 'primary' : 'muted'} />
                            {s.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-fg">
                          {activeChatsCount}
                        </td>
                        {isSupervisorMode && (
                          <td className="px-4 py-3 font-mono text-xs tracking-widest text-muted">
                            {s.pin || '••••'}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isLockedCurrent && (
                              <Badge variant="primary">
                                <Lock size={10} /> Sua conta
                              </Badge>
                            )}

                            {isSupervisorMode && s.active && (
                              <>
                                <Button
                                  variant={isBeingImpersonated ? 'accent' : 'ghost'}
                                  size="sm"
                                  onClick={() => onImpersonateSeller?.(s, true)}
                                  title={`Ver os atendimentos de ${s.name}`}
                                >
                                  <Eye size={13} />
                                  {isBeingImpersonated ? 'Espelhando' : 'Entrar na conta'}
                                </Button>
                                <IconButton
                                  label={`Travar sessão como ${s.name}`}
                                  size="sm"
                                  onClick={() => onLockToSeller?.(s)}
                                >
                                  <Lock size={13} />
                                </IconButton>
                              </>
                            )}

                            {isSupervisorMode && (
                              <>
                                <IconButton label="Editar" size="sm" onClick={() => startEdit(s)}>
                                  <Pencil size={13} />
                                </IconButton>
                                <IconButton
                                  label={s.active ? 'Desativar' : 'Reativar'}
                                  size="sm"
                                  onClick={() => handleToggleActive(s)}
                                >
                                  {s.active ? <UserX size={13} /> : <UserCheck size={13} />}
                                </IconButton>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

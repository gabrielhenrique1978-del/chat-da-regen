import React, { useState, useEffect } from 'react';
import { ArrowRight, MessageSquare, Inbox } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Avatar, IconButton, StatusDot } from './ui';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR');

export default function KanbanView({
  onOpenContactInInbox,
  isSupervisorMode = true,
  activeSeller = null,
}) {
  const [board, setBoard] = useState(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadBoard = async (pid = selectedPipelineId) => {
    setLoading(true);
    try {
      const data = await api.getKanban(pid);
      setBoard(data);
      if (!pid && data?.pipeline?.id) {
        setSelectedPipelineId(data.pipeline.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

  const handleMove = async (dealId, targetStageId, value) => {
    await api.moveDealStage(dealId, targetStageId, value);
    await loadBoard(selectedPipelineId);
  };

  const rawStages = board?.stages || [];
  const pipelines = board?.pipelines || [];

  // Se for vendedor comum, enclausura estritamente apenas os negócios deste vendedor
  const stages = isSupervisorMode
    ? rawStages
    : rawStages.map((st) => ({
        ...st,
        deals: (st.deals || []).filter((deal) => {
          const c = deal.contact || {};
          const sellerName = activeSeller?.name?.toLowerCase() || '';
          const sellerId = activeSeller?.id;
          return (
            (sellerId && c.seller_id === sellerId) ||
            (sellerName && (c.assignee || '').toLowerCase() === sellerName) ||
            (sellerId && deal.seller_id === sellerId)
          );
        }),
      }));

  const totalDeals = stages.reduce((n, st) => n + (st.deals?.length || 0), 0);
  const totalValue = stages.reduce((n, st) => n + Number(st.total_value || 0), 0);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-canvas text-fg">
      {/* Cabeçalho da página */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-sm font-semibold text-fg">
            Funil de vendas {!isSupervisorMode && activeSeller ? `(${activeSeller.name})` : ''}
          </h1>
          {!loading && (
            <span className="truncate text-xs tabular-nums text-muted">
              {totalDeals} negócios · R$ {brl(totalValue)}
            </span>
          )}
        </div>
        <select
          aria-label="Selecionar funil"
          value={selectedPipelineId}
          onChange={(e) => {
            setSelectedPipelineId(e.target.value);
            loadBoard(e.target.value);
          }}
          className="h-8 min-w-[180px] rounded-md border border-line-strong bg-surface px-2.5 text-xs text-fg focus:border-primary/60 focus:outline-none"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </header>

      {loading ? (
        <div className="flex flex-1 gap-3 overflow-hidden p-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 w-72 shrink-0 animate-pulse rounded-lg bg-surface/60" />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 gap-3 overflow-x-auto p-6">
          {stages.map((st, idx) => {
            const nextStage = stages[idx + 1];
            const deals = st.deals || [];
            return (
              <section
                key={st.id}
                className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-surface/60"
              >
                {/* Cabeçalho da coluna */}
                <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-medium text-fg">{st.name}</span>
                    <span className="text-2xs tabular-nums text-muted">{deals.length}</span>
                  </div>
                  <span className="text-2xs tabular-nums text-muted">R$ {brl(st.total_value)}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {deals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line py-8 text-center">
                      <Inbox size={14} className="mb-1.5 text-muted/60" />
                      <span className="text-2xs text-muted">Nenhum negócio</span>
                    </div>
                  ) : (
                    deals.map((deal) => {
                      const c = deal.contact || {};
                      return (
                        <article
                          key={deal.id}
                          className="group rounded-md border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-elevated/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="truncate text-[13px] font-medium text-fg">
                                {c.name || deal.title}
                              </h4>
                              <p className="mt-0.5 truncate text-2xs text-muted">
                                {c.name ? deal.title : c.phone}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-medium tabular-nums text-fg">
                              <span className="text-muted">R$ </span>
                              {brl(deal.value)}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Avatar name={c.assignee || 'IA'} size="xs" />
                              <span className="truncate text-2xs text-muted">
                                {c.assignee || 'Agente IA'}
                              </span>
                              {c.temperature && (
                                <StatusDot
                                  tone={
                                    c.temperature === 'hot'
                                      ? 'primary'
                                      : c.temperature === 'warm'
                                      ? 'accent'
                                      : 'muted'
                                  }
                                  className="ml-0.5"
                                />
                              )}
                            </span>

                            <div
                              className={cn(
                                'flex items-center gap-0.5 transition-opacity',
                                'opacity-60 group-hover:opacity-100'
                              )}
                            >
                              {c.id && (
                                <IconButton
                                  label="Abrir conversa"
                                  size="sm"
                                  onClick={() => onOpenContactInInbox?.(c.id)}
                                >
                                  <MessageSquare size={13} />
                                </IconButton>
                              )}
                              {nextStage && (
                                <IconButton
                                  label={`Avançar para ${nextStage.name}`}
                                  size="sm"
                                  onClick={() => handleMove(deal.id, nextStage.id, deal.value)}
                                >
                                  <ArrowRight size={13} />
                                </IconButton>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

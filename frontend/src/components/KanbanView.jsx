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
  const [draggedDeal, setDraggedDeal] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);

  const loadBoard = async (pid = selectedPipelineId, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getKanban(pid);
      setBoard(data);
      if (!pid && data?.pipeline?.id) {
        setSelectedPipelineId(data.pipeline.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

  const handleMove = async (dealId, targetStageId, value) => {
    if (!dealId || !targetStageId) return;
    // Atualização otimista imediata na coluna do Kanban
    setBoard((prev) => {
      if (!prev || !Array.isArray(prev.stages)) return prev;
      let movedDeal = null;
      const strippedStages = prev.stages.map((st) => {
        const found = (st.deals || []).find((d) => d.id === dealId);
        if (found) movedDeal = { ...found, stage_id: targetStageId };
        const remaining = (st.deals || []).filter((d) => d.id !== dealId);
        return {
          ...st,
          deals: remaining,
          total_value: remaining.reduce((acc, d) => acc + Number(d.value || 0), 0),
        };
      });
      if (!movedDeal) return prev;
      const nextStages = strippedStages.map((st) => {
        if (st.id !== targetStageId) return st;
        const nextDeals = [movedDeal, ...(st.deals || [])];
        return {
          ...st,
          deals: nextDeals,
          total_value: nextDeals.reduce((acc, d) => acc + Number(d.value || 0), 0),
        };
      });
      return { ...prev, stages: nextStages };
    });
    await api.moveDealStage(dealId, targetStageId, value);
    await loadBoard(selectedPipelineId, true);
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
            const isDropTarget = dragOverStageId === st.id;
            return (
              <section
                key={st.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStageId !== st.id) setDragOverStageId(st.id);
                }}
                onDragLeave={() => {
                  if (dragOverStageId === st.id) setDragOverStageId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  if (draggedDeal && draggedDeal.stage_id !== st.id) {
                    handleMove(draggedDeal.id, st.id, draggedDeal.value);
                  }
                  setDraggedDeal(null);
                }}
                className={cn(
                  'flex w-72 shrink-0 flex-col rounded-lg border bg-surface/60 transition-colors',
                  isDropTarget ? 'border-primary/60 bg-elevated/40' : 'border-line'
                )}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/60 px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusDot
                      tone={st.is_won ? 'primary' : st.is_lost ? 'accent' : 'secondary'}
                    />
                    <span className="truncate text-xs font-medium text-fg">{st.name}</span>
                    <span className="rounded bg-elevated px-1.5 py-0.5 text-2xs tabular-nums text-muted">
                      {deals.length}
                    </span>
                  </div>
                  <span className="text-2xs font-medium tabular-nums text-muted">
                    R$ {brl(st.total_value)}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {deals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line py-8 text-center">
                      <Inbox size={14} className="mb-1.5 text-muted/60" />
                      <span className="text-2xs text-muted">Arraste negócios para cá</span>
                    </div>
                  ) : (
                    deals.map((deal) => {
                      const c = deal.contact || {};
                      return (
                        <article
                          key={deal.id}
                          draggable
                          onDragStart={() => setDraggedDeal(deal)}
                          onDragEnd={() => {
                            setDraggedDeal(null);
                            setDragOverStageId(null);
                          }}
                          className="group cursor-grab active:cursor-grabbing rounded-md border border-line bg-surface p-3 shadow-subtle transition-colors hover:border-line-strong hover:bg-elevated/50"
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

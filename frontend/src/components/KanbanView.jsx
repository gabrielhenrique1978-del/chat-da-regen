import React, { useState, useEffect } from 'react';
import {
  Kanban,
  DollarSign,
  UserCheck,
  Flame,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export default function KanbanView({ onOpenContactInInbox }) {
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

  const stages = board?.stages || [];
  const pipelines = board?.pipelines || [];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-[#0A0D14] text-[#F8FAFC] p-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#F8FAFC] flex items-center gap-2.5">
            <Kanban className="text-[#00D2FF]" size={22} />
            Funil Comercial CRM (Kanban)
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Acompanhe negócios em tempo real sincronizados com as conversas do
            WhatsApp e Instagram.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedPipelineId}
            onChange={(e) => {
              setSelectedPipelineId(e.target.value);
              loadBoard(e.target.value);
            }}
            className="rounded-xl border border-[#1E293B] bg-[#121824] px-3.5 py-2 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                Funil: {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Colunas do Kanban */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#94A3B8]">
          Carregando funil...
        </div>
      ) : (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {stages.map((st, idx) => {
            const nextStage = stages[idx + 1];
            return (
              <div
                key={st.id}
                className="w-80 shrink-0 flex flex-col rounded-2xl bg-[#121824] border border-[#1E293B] overflow-hidden shadow-subtle"
              >
                {/* Topo da Coluna */}
                <div className="p-3.5 bg-[#121824] border-b border-[#1E293B] flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-[#F8FAFC]">
                      {st.name}
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1B2333] text-[#94A3B8] border border-[#1E293B]">
                      {st.deals?.length || 0}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[#00D2FF]">
                    R$ {Number(st.total_value || 0).toLocaleString('pt-BR')}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {(st.deals || []).map((deal) => {
                    const c = deal.contact || {};
                    return (
                      <div
                        key={deal.id}
                        className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-2.5 hover:border-[#00D2FF]/40 hover:bg-[#1B2333]/40 transition shadow-subtle"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-xs text-[#F8FAFC]">
                              {c.name || deal.title}
                            </h4>
                            <p className="text-[11px] text-[#94A3B8]">
                              {c.phone || deal.title}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-[#00D2FF] flex items-center">
                            <DollarSign size={12} />
                            {Number(deal.value || 0).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#121824] border border-[#1E293B] text-[#94A3B8] font-medium">
                            <UserCheck size={11} className="text-[#00D2FF]" />
                            {c.assignee || 'Agente IA'}
                          </span>
                          {c.temperature === 'hot' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-500/30 text-rose-300 font-semibold">
                              <Flame size={11} /> Quente
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between gap-2">
                          <button
                            onClick={() =>
                              c.id && onOpenContactInInbox?.(c.id)
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00D2FF] hover:underline"
                          >
                            <MessageSquare size={12} /> Abrir Chat
                          </button>

                          {nextStage && (
                            <button
                              onClick={() =>
                                handleMove(deal.id, nextStage.id, deal.value)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-[10px] font-bold transition"
                              title={`Avançar para ${nextStage.name}`}
                            >
                              <span>Avançar</span>
                              <ArrowRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

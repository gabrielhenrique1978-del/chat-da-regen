import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  QrCode,
  Globe,
  CheckCircle2,
  Zap,
  RefreshCw,
  LogOut,
  Shield,
} from 'lucide-react';
import { api } from '../lib/api';

export default function ConnectionsView({ onWebhookSimulated }) {
  const [waStatus, setWaStatus] = useState(null);
  const [metaCfg, setMetaCfg] = useState({
    phone_number_id: '',
    waba_id: '',
    ig_account_id: '',
    access_token: '',
    verify_token: 'regenflow_meta_verify_2026',
    app_secret: '',
  });
  const [metaTestResult, setMetaTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [wa, meta] = await Promise.all([
        api.getWhatsAppStatus(),
        api.getMetaConfig(),
      ]);
      setWaStatus(wa);
      setMetaCfg((prev) => ({
        ...prev,
        phone_number_id: meta.phone_number_id || '',
        waba_id: meta.waba_id || '',
        ig_account_id: meta.ig_account_id || '',
        verify_token: meta.verify_token || 'regenflow_meta_verify_2026',
      }));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveMeta = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await api.saveMetaConfig(metaCfg);
      setMetaTestResult({
        ok: true,
        message:
          'Credenciais da API Oficial da Meta salvas e criptografadas com AES-256!',
      });
    } catch (err) {
      setMetaTestResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestGraphApi = async () => {
    await handleSaveMeta();
    const res = await api.testMetaConnection();
    setMetaTestResult({
      ok: res.connected,
      message: res.message,
    });
  };

  const handleSimulateOfficialWebhook = async () => {
    const samplePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_OFFICIAL_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '109283746512345' },
                contacts: [
                  {
                    profile: { name: 'Cliente Oficial Meta Cloud' },
                    wa_id: '5511998765432',
                  },
                ],
                messages: [
                  {
                    from: '5511998765432',
                    id: `wamid.meta_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: {
                      body: 'Olá! Enviei esta mensagem via WhatsApp Oficial (Meta Cloud API). Quero conhecer os planos!',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await api.simulateMetaWebhook(samplePayload);
    setMetaTestResult({
      ok: true,
      message:
        '⚡ Evento Oficial da Meta simulado e recebido com sucesso! Verifique a conversa na aba Atendimento.',
    });
    onWebhookSimulated?.();
  };

  const handleSimulateInstagramCommentWebhook = async () => {
    const sampleIgCommentPayload = {
      object: 'instagram',
      entry: [
        {
          id: 'IG_BUSINESS_ACCOUNT_01',
          changes: [
            {
              field: 'comments',
              value: {
                id: `ig_comment_${Date.now()}`,
                text: 'Eu quero! Qual o valor desse pacote e como faço para contratar?',
                from: {
                  id: '9988776655',
                  username: 'carolina.mendes.fit',
                },
                media: {
                  id: '180987654321',
                  media_product_type: 'REELS',
                },
              },
            },
          ],
        },
      ],
    };
    await api.simulateMetaWebhook(sampleIgCommentPayload);
    setMetaTestResult({
      ok: true,
      message:
        '📸 Comentário em Reels do Instagram simulado! O sistema respondeu publicamente no post e abriu a conversa no Direct (Comment-to-DM).',
    });
    onWebhookSimulated?.();
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-[#0A0D14] text-[#F8FAFC] space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#F8FAFC] flex items-center gap-2.5">
          <Smartphone className="text-[#00D2FF]" size={22} />
          Conexões WhatsApp QR Code & API Oficial da Meta
        </h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          Conecte o WhatsApp da loja via QR Code ou opere em alta escala com a
          Graph API v21.0 Oficial da Meta (WhatsApp Cloud API & Instagram).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: WhatsApp Web QR Code Bridge */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-6 space-y-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <QrCode className="text-[#00D2FF]" size={20} />
              <h2 className="font-semibold text-sm text-[#F8FAFC]">
                WhatsApp da Loja (QR Code Direto)
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#1B2333] text-[#00D2FF] border border-[#00D2FF]/30">
              Estado: {waStatus?.state || 'disconnected'}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#0A0D14] border border-[#1E293B] min-h-64">
            {waStatus?.state === 'connected' ? (
              <div className="text-center space-y-2">
                <CheckCircle2
                  size={44}
                  className="text-[#00D2FF] mx-auto"
                />
                <div className="font-semibold text-sm text-[#F8FAFC]">
                  WhatsApp Conectado e Sincronizado!
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Número: {waStatus?.phone_number || 'Sessão Ativa'}
                </p>
              </div>
            ) : waStatus?.qrcode ? (
              <div className="text-center space-y-3">
                <img
                  src={waStatus.qrcode}
                  alt="QR Code WhatsApp"
                  className="w-48 h-48 mx-auto rounded-xl border border-[#1E293B] bg-white p-2"
                />
                <p className="text-xs text-[#94A3B8]">
                  Abra o WhatsApp no celular → Aparelhos Conectados → Conectar
                  Aparelho
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8]">
                Clique em &ldquo;Gerar QR Code&rdquo; abaixo para iniciar a sessão.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                const res = await api.connectWhatsApp();
                setWaStatus(res);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold transition shadow-xs"
            >
              <RefreshCw size={14} />
              <span>Gerar QR Code</span>
            </button>
            <button
              onClick={async () => {
                const res = await api.simulateWhatsAppScan();
                setWaStatus(res);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#1E293B] bg-[#1B2333] hover:border-[#00D2FF]/40 text-[#F8FAFC] text-xs font-semibold transition"
            >
              <Zap size={14} className="text-[#00D2FF]" />
              <span>Simular Leitura</span>
            </button>
            {waStatus?.state === 'connected' && (
              <button
                onClick={async () => {
                  const res = await api.disconnectWhatsApp();
                  setWaStatus(res);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-accent/30 text-fg hover:bg-accent-deep/30 text-xs font-semibold ml-auto transition"
              >
                <LogOut size={14} />
                <span>Desconectar</span>
              </button>
            )}
          </div>
        </div>

        {/* Card 2: API Oficial da Meta (Graph API v21.0) */}
        <form
          onSubmit={handleSaveMeta}
          className="bg-[#121824] border border-[#1E293B] rounded-2xl p-6 space-y-4 shadow-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Globe className="text-[#0072FF]" size={20} />
              <h2 className="font-semibold text-sm text-[#F8FAFC]">
                API Oficial da Meta (Graph API v21.0)
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#1B2333] text-[#A5B4FC] border border-[#6366F1]/30">
              HMAC-SHA256 & 24h Window
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs space-y-1">
            <div className="font-semibold text-[#F8FAFC]">
              Webhook Callback URL (Meta for Developers):
            </div>
            <div className="font-mono text-[11px] bg-[#121824] text-[#00D2FF] p-2 rounded border border-[#1E293B] select-all">
              {window.location.origin}/api/webhooks/meta
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                Phone Number ID (WhatsApp)
              </label>
              <input
                type="text"
                value={metaCfg.phone_number_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, phone_number_id: e.target.value })
                }
                placeholder="Ex: 109283746512345"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                WABA ID (Conta WhatsApp)
              </label>
              <input
                type="text"
                value={metaCfg.waba_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, waba_id: e.target.value })
                }
                placeholder="Ex: 987654321012345"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                Instagram Business ID
              </label>
              <input
                type="text"
                value={metaCfg.ig_account_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, ig_account_id: e.target.value })
                }
                placeholder="Ex: 17841400000000"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                Verify Token (hub.verify_token)
              </label>
              <input
                type="text"
                value={metaCfg.verify_token}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, verify_token: e.target.value })
                }
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs font-mono text-[#F8FAFC] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                Permanent Access Token (System User)
              </label>
              <input
                type="password"
                value={metaCfg.access_token}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, access_token: e.target.value })
                }
                placeholder="EAAGm0PX4ZCps..."
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#94A3B8] mb-1">
                App Secret (X-Hub-Signature-256)
              </label>
              <input
                type="password"
                value={metaCfg.app_secret}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, app_secret: e.target.value })
                }
                placeholder="Chave secreta do aplicativo Meta"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#00D2FF]"
              />
            </div>
          </div>

          {metaTestResult && (
            <div className="p-3 rounded-xl border text-xs font-medium bg-[#0A0D14] border-[#1E293B] text-[#F8FAFC]">
              {metaTestResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTestGraphApi}
                className="px-3 py-2 rounded-xl border border-[#1E293B] bg-[#1B2333] hover:border-[#0072FF]/40 text-[#F8FAFC] text-xs font-semibold transition"
              >
                Testar Graph API
              </button>
              <button
                type="button"
                onClick={handleSimulateOfficialWebhook}
                className="px-3 py-2 rounded-xl border border-[#1E293B] bg-[#1B2333] hover:border-[#00D2FF]/40 text-[#F8FAFC] text-xs font-semibold transition"
              >
                Simular WhatsApp
              </button>
              <button
                type="button"
                onClick={handleSimulateInstagramCommentWebhook}
                className="px-3 py-2 rounded-xl border border-line-strong bg-elevated hover:border-primary/40 text-fg text-xs font-semibold transition"
              >
                Simular Comentário Insta
              </button>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#00D2FF] hover:bg-[#38BDF8] text-[#0A0D14] text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
            >
              <Shield size={13} />
              <span>Salvar (AES-256)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

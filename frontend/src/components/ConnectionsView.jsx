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
    verify_token: 'openchatfunnel_meta_verify_2026',
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
        verify_token: meta.verify_token || 'openchatfunnel_meta_verify_2026',
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

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950 space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Smartphone className="text-emerald-600" size={24} />
          Conexões WhatsApp QR Code & API Oficial da Meta
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Conecte o WhatsApp da loja via QR Code ou opere em alta escala com a
          Graph API v21.0 Oficial da Meta (WhatsApp Cloud API & Instagram).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: WhatsApp Web QR Code Bridge */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <QrCode className="text-emerald-600" size={20} />
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                WhatsApp da Loja (QR Code Direto)
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Estado: {waStatus?.state || 'disconnected'}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 min-h-64">
            {waStatus?.state === 'connected' ? (
              <div className="text-center space-y-2">
                <CheckCircle2
                  size={48}
                  className="text-emerald-600 mx-auto"
                />
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  WhatsApp Conectado e Sincronizado!
                </div>
                <p className="text-xs text-slate-500">
                  Número: {waStatus?.phone_number || 'Sessão Ativa'}
                </p>
              </div>
            ) : waStatus?.qrcode ? (
              <div className="text-center space-y-3">
                <img
                  src={waStatus.qrcode}
                  alt="QR Code WhatsApp"
                  className="w-48 h-48 mx-auto rounded-xl border border-slate-200 bg-white p-2"
                />
                <p className="text-xs text-slate-500">
                  Abra o WhatsApp no celular → Aparelhos Conectados → Conectar
                  Aparelho
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition"
            >
              <RefreshCw size={14} />
              <span>Gerar QR Code</span>
            </button>
            <button
              onClick={async () => {
                const res = await api.simulateWhatsAppScan();
                setWaStatus(res);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold"
            >
              <Zap size={14} />
              <span>Simular Leitura Instantânea</span>
            </button>
            {waStatus?.state === 'connected' && (
              <button
                onClick={async () => {
                  const res = await api.disconnectWhatsApp();
                  setWaStatus(res);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold ml-auto"
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
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Globe className="text-blue-600" size={20} />
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                API Oficial da Meta (Graph API v21.0)
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              HMAC-SHA256 & 24h Window
            </span>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-1">
            <div className="font-bold text-blue-950 dark:text-blue-200">
              Webhook Callback URL (Meta for Developers):
            </div>
            <div className="font-mono text-[11px] bg-white dark:bg-slate-900 p-2 rounded border border-blue-200 dark:border-blue-800 select-all">
              {window.location.origin}/api/webhooks/meta
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Phone Number ID (WhatsApp)
              </label>
              <input
                type="text"
                value={metaCfg.phone_number_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, phone_number_id: e.target.value })
                }
                placeholder="Ex: 109283746512345"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                WABA ID (Conta WhatsApp)
              </label>
              <input
                type="text"
                value={metaCfg.waba_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, waba_id: e.target.value })
                }
                placeholder="Ex: 987654321012345"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Instagram Business ID
              </label>
              <input
                type="text"
                value={metaCfg.ig_account_id}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, ig_account_id: e.target.value })
                }
                placeholder="Ex: 17841400000000"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Verify Token (hub.verify_token)
              </label>
              <input
                type="text"
                value={metaCfg.verify_token}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, verify_token: e.target.value })
                }
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Permanent Access Token (System User)
              </label>
              <input
                type="password"
                value={metaCfg.access_token}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, access_token: e.target.value })
                }
                placeholder="EAAGm0PX4ZCps..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                App Secret (X-Hub-Signature-256)
              </label>
              <input
                type="password"
                value={metaCfg.app_secret}
                onChange={(e) =>
                  setMetaCfg({ ...metaCfg, app_secret: e.target.value })
                }
                placeholder="Chave secreta do aplicativo Meta"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs"
              />
            </div>
          </div>

          {metaTestResult && (
            <div className="p-3 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              {metaTestResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestGraphApi}
                className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 text-xs font-bold"
              >
                Testar Graph API
              </button>
              <button
                type="button"
                onClick={handleSimulateOfficialWebhook}
                className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold"
              >
                Simular Webhook Meta
              </button>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5"
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

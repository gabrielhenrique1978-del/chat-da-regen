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
  MessageCircle,
  Instagram,
  Copy,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Button, Field, IconButton, StatusDot, fieldClass } from './ui';

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
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [loadingWa, setLoadingWa] = useState(false);

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

  // Polling automático para atualizar o QR Code e detectar pareamento do WhatsApp
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const wa = await api.getWhatsAppStatus();
        setWaStatus((prev) => {
          if (!prev) return wa;
          if (
            prev.state !== wa.state ||
            prev.qrcode !== wa.qrcode ||
            prev.phone_number !== wa.phone_number
          ) {
            return wa;
          }
          return prev;
        });
      } catch (err) {
        // silencioso durante inicialização
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectWa = async () => {
    setLoadingWa(true);
    try {
      const res = await api.connectWhatsApp();
      setWaStatus(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWa(false);
    }
  };

  const handleSaveMeta = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await api.saveMetaConfig(metaCfg);
      setMetaTestResult({
        ok: true,
        message: 'Credenciais da API Oficial salvas e criptografadas em repouso (AES-256).',
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
                      body: 'Olá! Mensagem de teste recebida via WhatsApp Oficial (Meta Cloud API).',
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
      message: 'Evento oficial da Meta simulado. A conversa foi atualizada na aba Atendimento.',
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
      message: 'Comentário no Instagram simulado com suporte a Comment-to-DM.',
    });
    onWebhookSimulated?.();
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/meta`;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-canvas text-fg">
      {/* Cabeçalho */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div>
          <h1 className="text-sm font-semibold text-fg">Conexões</h1>
          <p className="text-2xs text-muted">
            Integração com WhatsApp Web e API Oficial da Meta (Cloud API & Instagram Graph API).
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Card 1: WhatsApp QR Code Bridge */}
          <section className="flex flex-col justify-between rounded-lg border border-line bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <QrCode size={18} className="text-primary" />
                <h2 className="text-xs font-medium text-fg">
                  WhatsApp (Pareamento via QR Code)
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
                <StatusDot
                  tone={waStatus?.state === 'connected' ? 'primary' : 'muted'}
                />
                <span className="capitalize">{waStatus?.state || 'Desconectado'}</span>
              </span>
            </div>

            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-line bg-canvas p-6 text-center">
              {loadingWa ? (
                <div className="space-y-3">
                  <RefreshCw size={24} className="mx-auto text-primary animate-spin" />
                  <p className="text-2xs text-muted">
                    Conectando aos servidores do WhatsApp...
                  </p>
                </div>
              ) : waStatus?.state === 'connected' ? (
                <div className="space-y-2">
                  <CheckCircle2 size={36} className="mx-auto text-primary" />
                  <p className="text-xs font-medium text-fg">
                    WhatsApp conectado e sincronizado
                  </p>
                  <p className="text-2xs font-mono text-muted">
                    {waStatus?.phone_number || 'Sessão ativa'}
                  </p>
                </div>
              ) : waStatus?.qrcode ? (
                <div className="space-y-3">
                  <img
                    src={waStatus.qrcode}
                    alt="QR Code WhatsApp"
                    className="mx-auto h-48 w-48 rounded border border-line bg-white p-2"
                  />
                  <div className="space-y-1">
                    <p className="text-2xs font-medium text-fg">
                      Aponte a câmera do WhatsApp:
                    </p>
                    <p className="text-2xs text-muted">
                      WhatsApp no celular &rarr; Aparelhos conectados &rarr; Conectar um aparelho
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <QrCode size={36} className="mx-auto text-muted/40" />
                  <p className="text-2xs text-muted">
                    Clique em &ldquo;Gerar QR Code&rdquo; para iniciar o pareamento.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                disabled={loadingWa}
                onClick={handleConnectWa}
              >
                <RefreshCw size={13} className={loadingWa ? 'animate-spin' : ''} />
                <span>{loadingWa ? 'Gerando...' : 'Gerar QR Code'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const res = await api.simulateWhatsAppScan();
                  setWaStatus(res);
                }}
              >
                <Zap size={13} />
                <span>Simular leitura</span>
              </Button>

              {waStatus?.state === 'connected' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={async () => {
                    const res = await api.disconnectWhatsApp();
                    setWaStatus(res);
                  }}
                >
                  <LogOut size={13} />
                  <span>Desconectar</span>
                </Button>
              )}
            </div>
          </section>

          {/* Card 2: Meta Oficial Cloud API */}
          <form
            onSubmit={handleSaveMeta}
            className="flex flex-col justify-between rounded-lg border border-line bg-surface p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Globe size={18} className="text-secondary" />
                <h2 className="text-xs font-medium text-fg">
                  API Oficial da Meta (Graph API v21.0)
                </h2>
              </div>
              <span className="text-2xs text-muted">
                WhatsApp Cloud & Instagram
              </span>
            </div>

            <div className="rounded-md border border-line bg-canvas p-3 space-y-1.5">
              <div className="flex items-center justify-between text-2xs text-muted">
                <span>Webhook Callback URL:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Copy size={11} />
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar URL'}</span>
                </button>
              </div>
              <p className="font-mono text-2xs text-fg select-all break-all">
                {webhookUrl}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone Number ID (WhatsApp)">
                <input
                  type="text"
                  value={metaCfg.phone_number_id}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, phone_number_id: e.target.value })
                  }
                  placeholder="109283746512345"
                  className={fieldClass}
                />
              </Field>

              <Field label="WABA ID (Conta WhatsApp)">
                <input
                  type="text"
                  value={metaCfg.waba_id}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, waba_id: e.target.value })
                  }
                  placeholder="987654321012345"
                  className={fieldClass}
                />
              </Field>

              <Field label="Instagram Business ID">
                <input
                  type="text"
                  value={metaCfg.ig_account_id}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, ig_account_id: e.target.value })
                  }
                  placeholder="17841400000000"
                  className={fieldClass}
                />
              </Field>

              <Field label="Verify Token (hub.verify_token)">
                <input
                  type="text"
                  value={metaCfg.verify_token}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, verify_token: e.target.value })
                  }
                  className={cn(fieldClass, 'font-mono')}
                />
              </Field>

              <Field label="Access Token Permanente (System User)">
                <input
                  type="password"
                  value={metaCfg.access_token}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, access_token: e.target.value })
                  }
                  placeholder="EAAGm0PX4ZCps..."
                  className={fieldClass}
                />
              </Field>

              <Field label="App Secret (Assinatura HMAC)">
                <input
                  type="password"
                  value={metaCfg.app_secret}
                  onChange={(e) =>
                    setMetaCfg({ ...metaCfg, app_secret: e.target.value })
                  }
                  placeholder="Chave secreta do app Meta"
                  className={fieldClass}
                />
              </Field>
            </div>

            {metaTestResult && (
              <div className="rounded-md border border-line bg-canvas p-3 text-xs text-muted flex items-center gap-2">
                <StatusDot tone={metaTestResult.ok ? 'primary' : 'accent'} />
                <span>{metaTestResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTestGraphApi}
                >
                  Testar API
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSimulateOfficialWebhook}
                >
                  <MessageCircle size={13} />
                  <span>Simular WhatsApp</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSimulateInstagramCommentWebhook}
                >
                  <Instagram size={13} />
                  <span>Simular Instagram</span>
                </Button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={saving}
              >
                <Shield size={13} />
                <span>Salvar configurações</span>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

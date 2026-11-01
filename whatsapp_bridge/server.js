import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 8080;
const FASTAPI_WEBHOOK = process.env.WEBHOOK_URL || 'http://localhost:8000/api/webhooks/evolution';
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

const logger = pino({ level: 'silent' });

let sock = null;
let currentQR = null;
let connectionState = 'close'; // 'open' | 'connecting' | 'close'
let myPhoneNumber = null;
let isStarting = false;

async function notifyWebhook(payload) {
  try {
    await fetch(FASTAPI_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // FastAPI pode estar ocupado ou inicializando
  }
}

async function processAndForwardMessage(msg) {
  if (!msg || !msg.message) return;

  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
    return; // Ignora grupos e status stories
  }

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.title ||
    '';

  const isAudio = Boolean(msg.message.audioMessage);
  if (!text && !isAudio) return;

  const pushName = msg.pushName || 'Contato WhatsApp';
  const fromMe = Boolean(msg.key?.fromMe);

  console.log(`📩 [WhatsApp ${fromMe ? 'Enviada (App)' : 'Recebida'} (${remoteJid})]: ${text || '[Áudio]'}`);

  await notifyWebhook({
    event: 'messages.upsert',
    instance: 'regenflow',
    data: {
      key: {
        remoteJid: remoteJid,
        fromMe: fromMe,
        id: msg.key?.id,
      },
      pushName: pushName,
      message: {
        conversation: text,
        ...(isAudio ? { audioMessage: { caption: text || 'Áudio gravado' } } : {}),
      },
    },
  });
}

async function startWhatsAppSocket() {
  if (sock && connectionState === 'open') {
    return;
  }
  if (isStarting) {
    return;
  }
  isStarting = true;

  try {
    // Limpeza defensiva de conexões anteriores
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (e) {}
      sock = null;
    }

    connectionState = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Regen Flow CRM', 'Chrome', '124.0.0'],
      syncFullHistory: false, // CRUCIAL: impede que o WhatsApp no celular fique pausado tentando sincronizar gigabytes
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('⚡ [Baileys] Novo QR Code real recebido do WhatsApp!');
        try {
          currentQR = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 8,
            errorCorrectionLevel: 'M',
          });
          await notifyWebhook({
            event: 'qrcode.updated',
            instance: 'regenflow',
            data: { qrcode: { base64: currentQR } },
          });
        } catch (e) {
          console.error('Erro ao gerar PNG do QR Code:', e);
        }
      }

      if (connection === 'open') {
        connectionState = 'open';
        currentQR = null;
        myPhoneNumber = sock.user?.id ? sock.user.id.split(':')[0] : null;
        console.log(`✅ [Baileys] WhatsApp Conectado com sucesso! Número: ${myPhoneNumber}`);
        await notifyWebhook({
          event: 'connection.update',
          instance: 'regenflow',
          data: { state: 'open', phone: myPhoneNumber },
        });
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`⚠️ [Baileys] Conexão encerrada (código ${statusCode}). Reconectar: ${shouldReconnect}`);

        connectionState = 'close';
        try {
          sock?.ev?.removeAllListeners();
        } catch (e) {}
        sock = null;

        if (statusCode === DisconnectReason.loggedOut) {
          currentQR = null;
          myPhoneNumber = null;
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          await notifyWebhook({
            event: 'connection.update',
            instance: 'regenflow',
            data: { state: 'close' },
          });
        } else {
          // Código 515 (restartRequired) ocorre logo após a leitura do QR Code
          const delay = statusCode === DisconnectReason.restartRequired ? 500 : 2500;
          console.log(`🔄 [Baileys] Restabelecendo socket em ${delay}ms...`);
          setTimeout(() => {
            startWhatsAppSocket().catch(console.error);
          }, delay);
        }
      }
    });

    // Recebimento de mensagens em tempo real
    sock.ev.on('messages.upsert', async ({ messages }) => {
      if (!messages || !Array.isArray(messages)) return;
      for (const msg of messages) {
        await processAndForwardMessage(msg);
      }
    });

    // Sincronização inicial de histórico das conversas recentes
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      console.log(`📥 [Baileys] Histórico sincronizado: ${chats?.length || 0} conversas, ${messages?.length || 0} mensagens.`);
      if (messages && Array.isArray(messages)) {
        // Envia as mensagens mais recentes para o CRM
        const recents = messages.slice(-100);
        for (const msg of recents) {
          try {
            await processAndForwardMessage(msg);
          } catch (e) {}
        }
      }
    });
  } catch (err) {
    console.error('Erro ao inicializar WhatsApp Socket:', err);
    connectionState = 'close';
  } finally {
    isStarting = false;
  }
}

// ---------------------------------------------------------------------
// Endpoints compatíveis com Evolution API (consumidos pelo FastAPI backend)
// ---------------------------------------------------------------------

app.get('/instance/connectionState/:instance', (req, res) => {
  res.json({
    instance: {
      instanceName: req.params.instance,
      state: connectionState,
      phone: myPhoneNumber,
    },
  });
});

app.post('/instance/create', async (req, res) => {
  startWhatsAppSocket().catch(console.error);
  res.status(201).json({
    instance: {
      instanceName: req.body.instanceName || 'regenflow',
      state: connectionState,
    },
  });
});

app.get('/instance/connect/:instance', async (req, res) => {
  if (!sock || connectionState === 'close') {
    startWhatsAppSocket().catch(console.error);
  }

  let attempts = 0;
  while (!currentQR && connectionState !== 'open' && attempts < 15) {
    await new Promise((r) => setTimeout(r, 200));
    attempts++;
  }

  res.json({
    instance: req.params.instance,
    state: connectionState,
    base64: currentQR,
    code: currentQR,
  });
});

app.delete('/instance/logout/:instance', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (err) {}
  connectionState = 'close';
  currentQR = null;
  myPhoneNumber = null;
  if (sock) {
    try {
      sock.ev.removeAllListeners();
    } catch (e) {}
    sock = null;
  }
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  res.json({ success: true, state: 'disconnected' });
});

app.post('/message/sendText/:instance', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!sock || connectionState !== 'open') {
      return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;

    const sent = await sock.sendMessage(jid, { text });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/message/sendWhatsAppAudio/:instance', async (req, res) => {
  try {
    const { number, audio } = req.body;
    if (!sock || connectionState !== 'open') {
      return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }

    const cleanNumber = number.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;

    const audioBuffer = Buffer.from(audio.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
    const sent = await sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: true,
    });

    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    console.error('Erro ao enviar áudio:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Regen Flow] WhatsApp Native Bridge rodando em http://localhost:${PORT}`);
});

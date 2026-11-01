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
let myLid = null;
let myName = null;
let isStarting = false;

// Armazena catálogo de contatos e conversas da agenda em memória
const contactsMap = new Map();

async function notifyWebhook(payload) {
  try {
    await fetch(FASTAPI_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Silencioso se FastAPI estiver ocupado
  }
}

function isSelfJid(jid) {
  if (!jid) return true;
  const clean = jid.split('@')[0].split(':')[0];
  if (myPhoneNumber && clean === myPhoneNumber) return true;
  if (myLid && clean === myLid) return true;
  if (clean.startsWith('7010')) return true; // LID do WhatsApp Web
  return false;
}

async function processAndForwardMessage(msg) {
  if (!msg || !msg.message) return;

  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid) return;

  // Ignora grupos, status e mensagens enviadas para você mesmo (auto-chat)
  if (remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast') || isSelfJid(remoteJid)) {
    return;
  }

  // Não aceita LIDs diretamente como telefone para não criar cliente fantasma
  if (remoteJid.endsWith('@lid')) {
    return;
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

  const fromMe = Boolean(msg.key?.fromMe);

  // Se a mensagem foi enviada por mim, o pushName é o meu próprio nome, não o do cliente!
  // Logo, recuperamos o nome real do cliente a partir da agenda (contactsMap)
  const contactPhone = remoteJid.split('@')[0];
  let clientName = contactsMap.get(contactPhone) || contactsMap.get(remoteJid);
  if (!clientName) {
    if (!fromMe && msg.pushName) {
      clientName = msg.pushName;
      contactsMap.set(contactPhone, clientName);
    } else {
      clientName = `WhatsApp (+${contactPhone})`;
    }
  }

  console.log(`📩 [WhatsApp ${fromMe ? 'Enviada' : 'Recebida'} (${contactPhone})]: ${text || '[Áudio]'}`);

  await notifyWebhook({
    event: 'messages.upsert',
    instance: 'regenflow',
    data: {
      key: {
        remoteJid: remoteJid,
        fromMe: fromMe,
        id: msg.key?.id,
      },
      pushName: clientName,
      message: {
        conversation: text,
        ...(isAudio ? { audioMessage: { caption: text || 'Áudio gravado' } } : {}),
      },
    },
  });
}

function processContactsList(contacts) {
  if (!Array.isArray(contacts)) return [];
  const validContacts = [];

  for (const c of contacts) {
    const jid = c.id || '';
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    if (isSelfJid(jid)) continue;

    const phone = jid.split('@')[0];
    const name = c.name || c.notify || c.verifiedName;
    if (name) {
      contactsMap.set(phone, name);
      contactsMap.set(jid, name);
      validContacts.push({
        id: jid,
        phone,
        name,
      });
    }
  }
  return validContacts;
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
      syncFullHistory: false, // Evita que o app móvel pause a sincronização
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
        myLid = sock.user?.lid ? sock.user.lid.split(':')[0] : null;
        myName = sock.user?.name || 'Regen Flow';

        console.log(`✅ [Baileys] WhatsApp Conectado com sucesso!`);
        console.log(`   Número: ${myPhoneNumber} | LID: ${myLid} | Nome: ${myName}`);

        await notifyWebhook({
          event: 'connection.update',
          instance: 'regenflow',
          data: {
            state: 'open',
            phone: myPhoneNumber,
            lid: myLid,
            name: myName,
          },
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
          myLid = null;
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          await notifyWebhook({
            event: 'connection.update',
            instance: 'regenflow',
            data: { state: 'close' },
          });
        } else {
          const delay = statusCode === DisconnectReason.restartRequired ? 500 : 2500;
          console.log(`🔄 [Baileys] Restabelecendo socket em ${delay}ms...`);
          setTimeout(() => {
            startWhatsAppSocket().catch(console.error);
          }, delay);
        }
      }
    });

    // Mensagens em tempo real
    sock.ev.on('messages.upsert', async ({ messages }) => {
      if (!messages || !Array.isArray(messages)) return;
      for (const msg of messages) {
        await processAndForwardMessage(msg);
      }
    });

    // Sincronização da agenda de contatos reais do celular
    sock.ev.on('contacts.upsert', async (contacts) => {
      const valid = processContactsList(contacts);
      if (valid.length > 0) {
        console.log(`📇 [Baileys] Sincronizados ${valid.length} contatos da agenda.`);
        await notifyWebhook({
          event: 'contacts.sync',
          instance: 'regenflow',
          data: { contacts: valid },
        });
      }
    });

    sock.ev.on('contacts.set', async ({ contacts }) => {
      const valid = processContactsList(contacts);
      if (valid.length > 0) {
        console.log(`📇 [Baileys] Agenda completa recebida: ${valid.length} contatos.`);
        await notifyWebhook({
          event: 'contacts.sync',
          instance: 'regenflow',
          data: { contacts: valid },
        });
      }
    });

    // Sincronização inicial das conversas recentes
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      if (contacts) processContactsList(contacts);
      console.log(`📥 [Baileys] Histórico recebido: ${chats?.length || 0} conversas, ${messages?.length || 0} mensagens.`);
      if (messages && Array.isArray(messages)) {
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
// Endpoints compatíveis com Evolution API
// ---------------------------------------------------------------------

app.get('/instance/connectionState/:instance', (req, res) => {
  res.json({
    instance: {
      instanceName: req.params.instance,
      state: connectionState,
      phone: myPhoneNumber,
      lid: myLid,
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
  myLid = null;
  contactsMap.clear();
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

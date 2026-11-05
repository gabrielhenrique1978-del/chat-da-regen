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
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const PORT = process.env.PORT || 8080;
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const INTERNAL_API_KEY = process.env.EVOLUTION_API_KEY || 'REGENFLOW_SECRET_KEY_2026';
const FASTAPI_WEBHOOK = process.env.WEBHOOK_URL || 'http://localhost:8000/api/webhooks/evolution';
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

// Middleware defensivo: aceita tráfego de loopback ou com apikey válida
app.use((req, res, next) => {
  const remoteIp = req.ip || req.socket?.remoteAddress || '';
  const isLoopback =
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1';
  const apiKey = req.headers['apikey'] || req.headers['x-webhook-secret'];
  if (isLoopback || apiKey === INTERNAL_API_KEY) {
    return next();
  }
  return res.status(401).json({ error: 'Acesso não autorizado ao motor WhatsApp Bridge.' });
});

const logger = pino({ level: 'silent' });

let sock = null;
let currentQR = null;
let connectionState = 'close'; // 'open' | 'connecting' | 'close'
let myPhoneNumber = null;
let myLid = null;
let myName = null;
let isStarting = false;

// Mapeamentos automáticos bidirecionais
const lidToPhoneMap = new Map();
const phoneToLidMap = new Map();
const contactsMap = new Map();
const jidMap = new Map();

function recordMapping(jid, lid, name) {
  if (!jid && !lid) return;
  const cleanPhone = jid && jid.includes('@s.whatsapp.net') ? jid.split('@')[0] : null;
  const cleanLid = lid && lid.includes('@lid') ? lid.split('@')[0] : (jid && jid.includes('@lid') ? jid.split('@')[0] : null);

  if (cleanPhone && cleanLid) {
    lidToPhoneMap.set(cleanLid, cleanPhone);
    phoneToLidMap.set(cleanPhone, cleanLid);
    jidMap.set(cleanPhone, `${cleanLid}@lid`);
    jidMap.set(cleanLid, `${cleanLid}@lid`);
  } else if (cleanLid) {
    jidMap.set(cleanLid, `${cleanLid}@lid`);
  } else if (cleanPhone) {
    jidMap.set(cleanPhone, `${cleanPhone}@s.whatsapp.net`);
  }

  if (name) {
    if (cleanPhone) contactsMap.set(cleanPhone, name);
    if (cleanLid) contactsMap.set(cleanLid, name);
  }
}

function getTargetJid(number) {
  if (!number) return null;
  const str = String(number).trim();
  if (str.includes('@')) {
    const [raw, domain] = str.split('@');
    const clean = raw.replace(/\D/g, '');
    // Se o domínio for lid ou tiver mais de 13 dígitos, é obrigatoriamente LID
    if (domain === 'lid' || clean.length > 13) {
      return `${clean}@lid`;
    }
    if (jidMap.has(clean)) {
      return jidMap.get(clean);
    }
    return str;
  }
  const clean = str.replace(/\D/g, '');
  if (jidMap.has(clean)) {
    return jidMap.get(clean);
  }
  if (phoneToLidMap.has(clean)) {
    return `${phoneToLidMap.get(clean)}@lid`;
  }
  if (clean.length > 13) {
    return `${clean}@lid`;
  }
  return `${clean}@s.whatsapp.net`;
}

async function notifyWebhook(payload) {
  try {
    await fetch(FASTAPI_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': INTERNAL_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Silencioso se FastAPI estiver ocupado
  }
}

function isSelfJid(jid) {
  if (!jid) return false;
  const clean = jid.split('@')[0].split(':')[0];
  if (myPhoneNumber && clean === myPhoneNumber) return true;
  if (myLid && clean === myLid) return true;
  if (clean.startsWith('7010')) return true;
  return false;
}

async function processAndForwardMessage(msg) {
  if (!msg || !msg.message) return;

  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid) return;

  // Ignora grupos e stories
  if (remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
    return;
  }

  const rawId = remoteJid.split('@')[0];
  const isLid = remoteJid.endsWith('@lid') || rawId.length > 13;

  // Registra mapeamento do JID ativo
  jidMap.set(rawId, remoteJid);
  jidMap.set(remoteJid, remoteJid);

  // Tenta resolver o telefone real a partir do mapa, senderPn ou participant
  let realPhone = isLid ? (lidToPhoneMap.get(rawId) || rawId) : rawId;
  const senderPn = msg.key?.senderPn || msg.key?.participantPn || msg.senderPn || msg.participantPn;
  if (senderPn && senderPn.includes('@s.whatsapp.net')) {
    realPhone = senderPn.split('@')[0];
    recordMapping(senderPn, remoteJid, msg.pushName);
    console.log(`📞 [Baileys] Telefone real identificado via senderPn: ${realPhone}`);
  } else {
    const altJid = msg.key?.participant || msg.participant;
    if (altJid && altJid.includes('@s.whatsapp.net')) {
      realPhone = altJid.split('@')[0];
      recordMapping(altJid, remoteJid, msg.pushName);
    }
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
  const isSelf = isSelfJid(remoteJid);

  let clientName;
  if (isSelf) {
    clientName = 'Meu WhatsApp (Conversa de Teste)';
    realPhone = myPhoneNumber || realPhone;
  } else {
    clientName = contactsMap.get(realPhone) || contactsMap.get(rawId) || contactsMap.get(remoteJid);
    if (!clientName) {
      if (!fromMe && msg.pushName) {
        clientName = msg.pushName;
        contactsMap.set(realPhone, clientName);
        contactsMap.set(rawId, clientName);
      } else {
        clientName = `WhatsApp (+${realPhone})`;
      }
    }
  }

  console.log(`📩 [WhatsApp ${fromMe ? 'Enviada' : 'Recebida'} (${realPhone})]: ${text || '[Áudio]'}`);

  await notifyWebhook({
    event: 'messages.upsert',
    instance: 'regenflow',
    data: {
      key: {
        remoteJid: remoteJid,
        fromMe: fromMe,
        id: msg.key?.id,
      },
      phone: realPhone,
      whatsappJid: remoteJid,
      pushName: clientName,
      isSelf: isSelf,
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
      syncFullHistory: false,
      shouldSyncHistoryMessage: (msg) => msg.syncType !== 2, // Permite RECENT e BOOTSTRAP, descarta FULL pesado
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
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`⚡ [messages.upsert] Evento (${type}): ${messages?.length || 0} mensagens.`);
      if (!messages || !Array.isArray(messages)) return;
      for (const msg of messages) {
        await processAndForwardMessage(msg);
      }
    });

    // Sincronização de contatos
    sock.ev.on('contacts.upsert', async (contacts) => {
      for (const c of contacts || []) {
        recordMapping(c.id, c.lid || c.lidJid, c.name || c.notify || c.verifiedName);
      }
    });

    sock.ev.on('contacts.set', async ({ contacts }) => {
      console.log(`📇 [Baileys] Agenda recebida: ${contacts?.length || 0} contatos.`);
      for (const c of contacts || []) {
        recordMapping(c.id, c.lid || c.lidJid, c.name || c.notify || c.verifiedName);
      }
    });

    // Sincronização de conversas (chats)
    sock.ev.on('chats.set', async ({ chats }) => {
      console.log(`💬 [Baileys] Lista de conversas recebida: ${chats?.length || 0} chats.`);
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
      }
    });

    sock.ev.on('chats.upsert', async (chats) => {
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
      }
    });

    // Evento oficial do WhatsApp quando o usuário compartilha o telefone real
    sock.ev.on('chats.phoneNumberShare', async ({ lid, jid }) => {
      console.log(`📞 [Baileys] chats.phoneNumberShare recebido: LID ${lid} -> Telefone ${jid}`);
      if (lid && jid) {
        recordMapping(jid, lid);
        const cleanPhone = jid.split('@')[0];
        const cleanLid = lid.split('@')[0];
        await notifyWebhook({
          event: 'contacts.phone_identified',
          instance: 'regenflow',
          data: {
            lid: cleanLid,
            phone: cleanPhone,
            jid: jid,
            lidJid: lid,
          },
        });
      }
    });

    // Sincronização de histórico recente
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      console.log(`📥 [Baileys] Sincronização inicial: ${chats?.length || 0} chats, ${contacts?.length || 0} contatos.`);
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
      }
      for (const c of contacts || []) {
        recordMapping(c.id, c.lid || c.lidJid, c.name || c.notify || c.verifiedName);
      }
      if (messages && Array.isArray(messages)) {
        for (const msg of messages.slice(-50)) {
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
// Endpoints de Envio Oficial (com suporte automático e transparente a LID e JID)
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
  lidToPhoneMap.clear();
  phoneToLidMap.clear();
  jidMap.clear();
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

    const targetJid = getTargetJid(number);
    console.log(`🚀 [Baileys] Enviando mensagem de texto para ${targetJid}: "${text}"`);
    const sent = await sock.sendMessage(targetJid, { text });
    res.json({ success: true, messageId: sent.key.id, jid: targetJid });
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

    const targetJid = getTargetJid(number);
    console.log(`🚀 [Baileys] Enviando áudio PTT para ${targetJid}`);
    const audioBuffer = Buffer.from(audio.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
    const sent = await sock.sendMessage(targetJid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: true,
    });

    res.json({ success: true, messageId: sent.key.id, jid: targetJid });
  } catch (err) {
    console.error('Erro ao enviar áudio:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/message/requestPhoneNumber/:instance', async (req, res) => {
  try {
    const { number } = req.body;
    if (!sock || connectionState !== 'open') {
      return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }

    const targetJid = getTargetJid(number);
    console.log(`📲 [Baileys] Solicitando compartilhamento nativo de telefone para ${targetJid}`);
    const sent = await sock.sendMessage(targetJid, { requestPhoneNumber: {} });
    res.json({ success: true, messageId: sent?.key?.id, jid: targetJid });
  } catch (err) {
    console.error('Erro ao solicitar telefone:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, BRIDGE_HOST, () => {
  console.log(`[Regen Flow] WhatsApp Native Bridge rodando de forma isolada em http://${BRIDGE_HOST}:${PORT}`);
  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    console.log('🔄 [Baileys] Sessão salva detectada em disco. Reconectando automaticamente...');
    startWhatsAppSocket().catch(console.error);
  }
});

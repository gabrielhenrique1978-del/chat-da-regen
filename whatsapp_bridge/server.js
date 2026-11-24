import './patch-baileys.js';
import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  normalizeMessageContent,
  generateMessageIDV2,
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

const logger = process.env.WA_DEBUG_LOG
  ? pino({ level: 'debug' }, pino.destination(process.env.WA_DEBUG_LOG))
  : pino({ level: 'silent' });

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

// Cache em memória de mensagens enviadas para permitir retry de criptografia Signal (evita Bad MAC)
const sentMessagesCache = new Map();

// Cache de contagem de retry Signal em memória
const rawRetryMap = new Map();
const fastRetryCounterCache = {
  get: (k) => rawRetryMap.get(k) ?? 0,
  set: (k, v) => rawRetryMap.set(k, v),
  del: (k) => rawRetryMap.delete(k),
  flushAll: () => rawRetryMap.clear(),
};
const noOpPlaceholderCache = {
  get: () => true,
  set: () => {},
  del: () => {},
  flushAll: () => {},
};

function unwrapMessageContent(m) {
  if (!m) return null;
  let curr = normalizeMessageContent(m) || m;
  for (let i = 0; i < 8; i++) {
    if (curr.deviceSentMessage?.message) {
      curr = curr.deviceSentMessage.message;
    } else if (curr.ephemeralMessage?.message) {
      curr = curr.ephemeralMessage.message;
    } else if (curr.viewOnceMessage?.message) {
      curr = curr.viewOnceMessage.message;
    } else if (curr.viewOnceMessageV2?.message) {
      curr = curr.viewOnceMessageV2.message;
    } else if (curr.viewOnceMessageV2Extension?.message) {
      curr = curr.viewOnceMessageV2Extension.message;
    } else if (curr.documentWithCaptionMessage?.message) {
      curr = curr.documentWithCaptionMessage.message;
    } else if (curr.associatedChildMessage?.message) {
      curr = curr.associatedChildMessage.message;
    } else if (curr.editedMessage?.message?.protocolMessage?.editedMessage) {
      curr = curr.editedMessage.message.protocolMessage.editedMessage;
    } else if (curr.editedMessage?.message) {
      curr = curr.editedMessage.message;
    } else {
      break;
    }
  }
  return curr;
}

function bufferToBase64DataUri(rawBuf, mime = 'image/jpeg') {
  if (!rawBuf) return null;
  try {
    if (typeof rawBuf === 'string') {
      return rawBuf.startsWith('data:') ? rawBuf : `data:${mime};base64,${rawBuf}`;
    }
    const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);
    if (buf.length === 0) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function extractMessageItem(msg, isHistory = false) {
  if (!msg || !msg.message) return null;

  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid) return null;

  // Ignora grupos e stories
  if (remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast') || remoteJid.includes('@newsletter')) {
    return null;
  }

  const inner = unwrapMessageContent(msg.message);
  if (!inner) return null;

  // Ignora mensagens internas de protocolo puro (exceto se for edição de texto)
  if (inner.protocolMessage && !inner.protocolMessage.editedMessage) {
    return null;
  }
  const contentObj = inner.protocolMessage?.editedMessage
    ? unwrapMessageContent(inner.protocolMessage.editedMessage)
    : inner;
  if (!contentObj) return null;

  // Identifica com precisão se a mensagem partiu da loja/aparelho próprio (fromMe) ou do cliente (!fromMe)
  const participantClean = (
    msg.key?.participant ||
    msg.participant ||
    msg.key?.senderLid ||
    msg.key?.senderPn ||
    ''
  )
    .split('@')[0]
    .split(':')[0];

  const fromMe = Boolean(
    msg.key?.fromMe ||
      msg.message?.deviceSentMessage ||
      (participantClean &&
        ((myPhoneNumber && participantClean === myPhoneNumber) ||
          (myLid && participantClean === myLid)))
  );

  const rawId = remoteJid.split('@')[0].split(':')[0];
  const isLid = remoteJid.endsWith('@lid') || rawId.length > 13;

  // Registra mapeamento do JID ativo
  jidMap.set(rawId, remoteJid);
  jidMap.set(remoteJid, remoteJid);

  // Tenta resolver o telefone real a partir do mapa, senderPn ou participant
  let realPhone = isLid ? (lidToPhoneMap.get(rawId) || rawId) : rawId;
  const senderPn =
    msg.key?.senderPn ||
    msg.key?.participantPn ||
    msg.senderPn ||
    msg.participantPn ||
    msg.key?.remoteJidAlt;
  if (senderPn && senderPn.includes('@s.whatsapp.net')) {
    const candidatePn = senderPn.split('@')[0].split(':')[0];
    if (!myPhoneNumber || candidatePn !== myPhoneNumber) {
      realPhone = candidatePn;
      recordMapping(senderPn, remoteJid, !fromMe ? msg.pushName : undefined);
    }
  } else {
    const altJid = msg.key?.participant || msg.participant;
    if (altJid && altJid.includes('@s.whatsapp.net')) {
      const candidatePn = altJid.split('@')[0].split(':')[0];
      if (!myPhoneNumber || candidatePn !== myPhoneNumber) {
        realPhone = candidatePn;
        recordMapping(altJid, remoteJid, !fromMe ? msg.pushName : undefined);
      }
    }
  }

  const videoObj = contentObj.videoMessage || contentObj.ptvMessage;
  let text =
    contentObj.conversation ||
    contentObj.extendedTextMessage?.text ||
    contentObj.imageMessage?.caption ||
    videoObj?.caption ||
    contentObj.documentMessage?.caption ||
    contentObj.documentMessage?.title ||
    contentObj.documentMessage?.fileName ||
    contentObj.buttonsResponseMessage?.selectedDisplayText ||
    contentObj.listResponseMessage?.title ||
    contentObj.templateButtonReplyMessage?.selectedDisplayText ||
    contentObj.interactiveResponseMessage?.body?.text ||
    contentObj.contactMessage?.displayName ||
    '';

  const isAudio = Boolean(contentObj.audioMessage || contentObj.pttMessage);
  let mediaType = 'text';
  let mediaUrl = null;

  if (contentObj.imageMessage) {
    mediaType = 'image';
    mediaUrl = bufferToBase64DataUri(contentObj.imageMessage.jpegThumbnail, 'image/jpeg');
    if (!text) {
      text = fromMe ? '📷 [Imagem enviada]' : '📷 [Imagem recebida]';
    }
  } else if (videoObj) {
    const thumbUri = bufferToBase64DataUri(videoObj.jpegThumbnail, 'image/jpeg');
    mediaType = thumbUri ? 'image' : 'text';
    mediaUrl = thumbUri;
    if (!text) {
      text = fromMe ? '🎥 [Vídeo enviado]' : '🎥 [Vídeo recebido]';
    }
  } else if (isAudio) {
    mediaType = 'audio';
    if (!text) {
      text = fromMe ? '🎙️ [Áudio enviado]' : '🎙️ [Áudio recebido]';
    }
  } else if (contentObj.documentMessage) {
    mediaType = 'document';
    const docName =
      contentObj.documentMessage.fileName ||
      contentObj.documentMessage.title ||
      'Arquivo';
    if (!text) {
      text = fromMe
        ? `📄 [Documento enviado: ${docName}]`
        : `📄 [Documento recebido: ${docName}]`;
    }
  } else if (!text) {
    if (contentObj.stickerMessage) {
      text = fromMe ? '🏷️ [Figurinha enviada]' : '🏷️ [Figurinha recebida]';
    } else if (contentObj.locationMessage || contentObj.liveLocationMessage) {
      text = fromMe ? '📍 [Localização enviada]' : '📍 [Localização compartilhada]';
    } else if (contentObj.contactMessage || contentObj.contactsArrayMessage) {
      text = fromMe ? '👤 [Contato enviado]' : '👤 [Contato compartilhado]';
    } else {
      return null;
    }
  }

  const isSelf = isSelfJid(remoteJid);

  let clientName;
  if (isSelf) {
    clientName = 'Meu WhatsApp (Conversa de Teste)';
    realPhone = myPhoneNumber || realPhone;
  } else {
    clientName = contactsMap.get(realPhone) || contactsMap.get(rawId) || contactsMap.get(remoteJid);
    if (!clientName) {
      if (!fromMe && msg.pushName && msg.pushName !== myName) {
        clientName = msg.pushName;
        contactsMap.set(realPhone, clientName);
        contactsMap.set(rawId, clientName);
      } else {
        clientName = `WhatsApp (+${realPhone})`;
      }
    }
  }

  // Preserva o timestamp original da mensagem no WhatsApp (quando disponível)
  const rawTs = msg.messageTimestamp?.low || msg.messageTimestamp;
  const isoTimestamp =
    rawTs && !isNaN(Number(rawTs))
      ? new Date(Number(rawTs) * 1000).toISOString()
      : new Date().toISOString();

  return {
    key: {
      remoteJid: remoteJid,
      fromMe: fromMe,
      id: msg.key?.id,
    },
    phone: realPhone,
    whatsappJid: remoteJid,
    pushName: clientName,
    isSelf: isSelf,
    isHistory: Boolean(isHistory),
    timestamp: isoTimestamp,
    mediaType: mediaType,
    mediaUrl: mediaUrl,
    _hasRawImage: Boolean(contentObj.imageMessage),
    _hasRawAudio: isAudio,
    _imageMime: contentObj.imageMessage?.mimetype || 'image/jpeg',
    _audioMime: (contentObj.audioMessage || contentObj.pttMessage)?.mimetype || 'audio/ogg; codecs=opus',
    message: {
      conversation: text,
      ...(isAudio ? { audioMessage: { caption: text } } : {}),
    },
  };
}

async function downloadMediaWithTimeout(msg, timeoutMs = 2800) {
  try {
    const downloadPromise = downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: sock?.updateMediaMessage,
      }
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('media_timeout')), timeoutMs)
    );
    return await Promise.race([downloadPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

async function processAndForwardMessage(msg, isHistory = false) {
  const item = extractMessageItem(msg, isHistory);
  if (!item) return;

  // Em mensagens ao vivo (tempo real), baixa a imagem ou áudio completo do WhatsApp
  if (!isHistory && (item._hasRawImage || item._hasRawAudio)) {
    const fullBuffer = await downloadMediaWithTimeout(msg, 2800);
    if (fullBuffer && fullBuffer.length > 0) {
      const mime = item._hasRawImage
        ? (item._imageMime || 'image/jpeg').split(';')[0]
        : (item._audioMime || 'audio/ogg').split(';')[0];
      item.mediaUrl = `data:${mime};base64,${fullBuffer.toString('base64')}`;
    }
  }

  delete item._hasRawImage;
  delete item._hasRawAudio;
  delete item._imageMime;
  delete item._audioMime;

  if (!isHistory) {
    console.log(
      `📩 [WhatsApp ${item.key.fromMe ? 'Enviada pela Loja' : 'Recebida do Cliente'} (${item.phone})]: ${
        item.message.conversation || '[Mídia]'
      }`
    );
  }

  await notifyWebhook({
    event: 'messages.upsert',
    instance: 'regenflow',
    data: item,
  });
}

function clearBridgeMemoryAndAuth() {
  currentQR = null;
  myPhoneNumber = null;
  myLid = null;
  myName = null;
  contactsMap.clear();
  lidToPhoneMap.clear();
  phoneToLidMap.clear();
  jidMap.clear();
  sentMessagesCache.clear();
  rawRetryMap.clear();
  if (fs.existsSync(AUTH_DIR)) {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

async function processAndForwardHistoryBatch(rawMessages) {
  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) return;

  // Agrupa mensagens por conversa (remoteJid/phone) para que TODAS as conversas ativas
  // sejam importadas instantaneamente ao conectar (mantendo as 35 mensagens mais recentes de cada chat)
  const byChat = new Map();
  for (const msg of rawMessages) {
    const extracted = extractMessageItem(msg, true);
    if (!extracted) continue;
    delete extracted._hasRawImage;
    delete extracted._hasRawAudio;
    delete extracted._imageMime;
    delete extracted._audioMime;

    const chatKey = extracted.whatsappJid || extracted.phone;
    if (!chatKey) continue;
    if (!byChat.has(chatKey)) {
      byChat.set(chatKey, []);
    }
    byChat.get(chatKey).push(extracted);
  }

  if (byChat.size === 0) return;

  const MAX_PER_CHAT = 35;
  const items = [];
  for (const [, chatItems] of byChat.entries()) {
    chatItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const recentChatItems = chatItems.slice(-MAX_PER_CHAT);
    items.push(...recentChatItems);
  }

  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Envia em blocos rápidos de 200 mensagens para inserção transacional em lote no PostgreSQL
  const CHUNK_SIZE = 200;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await notifyWebhook({
      event: 'messages.history_batch',
      instance: 'regenflow',
      data: {
        messages: chunk,
      },
    });
  }
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

    // Carrega imediatamente o número e o LID da loja já salvos nas credenciais antes mesmo do 1º pacote
    if (state.creds?.me?.id) {
      myPhoneNumber = state.creds.me.id.split(':')[0].split('@')[0];
    }
    if (state.creds?.me?.lid) {
      myLid = state.creds.me.lid.split(':')[0].split('@')[0];
    }
    if (state.creds?.me?.name) {
      myName = state.creds.me.name;
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ['Regen Flow CRM', 'Chrome', '124.0.0'],
      syncFullHistory: false, // Recebe bootstrap inicial e conversas recentes instantaneamente
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      // Baileys 7: suporte nativo a LID, cache interno de mensagens recentes para retry Signal
      enableRecentMessageCache: true,
      msgRetryCounterCache: fastRetryCounterCache,
      getMessage: async (key) => {
        if (key?.id && sentMessagesCache.has(key.id)) {
          return sentMessagesCache.get(key.id);
        }
        return undefined;
      },
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', async (update) => {
      if (update?.me?.id || state.creds?.me?.id) {
        myPhoneNumber = (update?.me?.id || state.creds?.me?.id).split(':')[0].split('@')[0];
      }
      if (update?.me?.lid || state.creds?.me?.lid) {
        myLid = (update?.me?.lid || state.creds?.me?.lid).split(':')[0].split('@')[0];
      }
      if (update?.me?.name || state.creds?.me?.name) {
        myName = update?.me?.name || state.creds?.me?.name;
      }
      await saveCreds();
    });

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
        myPhoneNumber = (sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null) || myPhoneNumber;
        myLid = (sock.user?.lid ? sock.user.lid.split(':')[0].split('@')[0] : null) || myLid;
        myName = sock.user?.name || myName || 'Regen Flow';

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
          clearBridgeMemoryAndAuth();
          await notifyWebhook({
            event: 'connection.update',
            instance: 'regenflow',
            data: { state: 'close', loggedOut: true },
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

    // Mensagens em tempo real ou lotes de histórico (type === 'append')
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!messages || !Array.isArray(messages)) return;
      for (const m of messages) {
        if (m?.key?.id && m?.message) {
          sentMessagesCache.set(m.key.id, m.message);
        }
      }
      // Se for uma mensagem recente (últimos 120 segundos), trata como tempo real mesmo se vier como 'append'
      const nowSec = Math.floor(Date.now() / 1000);
      const isRecentSingle =
        messages.length === 1 &&
        Math.abs(nowSec - Number(messages[0]?.messageTimestamp?.low || messages[0]?.messageTimestamp || nowSec)) <= 120;

      const isHistoryBatch = type !== 'notify' && !isRecentSingle;
      if (isHistoryBatch && messages.length > 1) {
        processAndForwardHistoryBatch(messages).catch(() => {});
        return;
      }
      for (const msg of messages) {
        await processAndForwardMessage(msg, isHistoryBatch);
      }
    });

    // Mensagens que foram descriptografadas após retry de chave Signal ou atualizações de recibo (messages.update)
    sock.ev.on('messages.update', async (updates) => {
      if (!updates || !Array.isArray(updates)) return;
      for (const u of updates) {
        if (u?.update?.message && u?.key) {
          const reconstructed = {
            key: u.key,
            message: u.update.message,
            messageTimestamp: u.update.messageTimestamp || Math.floor(Date.now() / 1000),
            pushName: u.update.pushName,
          };
          if (u.key.id) {
            sentMessagesCache.set(u.key.id, u.update.message);
          }
          await processAndForwardMessage(reconstructed, false);
        }
        if (typeof u?.update?.status === 'number' && u?.key?.id) {
          const st = u.update.status;
          const mappedStatus = st >= 4 ? 'read' : st === 3 ? 'delivered' : 'sent';
          if (st >= 3) {
            console.log(`✅ [Baileys] Recibo de entrega (${mappedStatus.toUpperCase()}) para msg ${u.key.id} (${u.key.remoteJid || ''})`);
          }
          await notifyWebhook({
            event: 'messages.status_update',
            instance: 'regenflow',
            data: {
              externalId: u.key.id,
              status: mappedStatus,
              rawStatus: st,
              remoteJid: u.key.remoteJid,
            },
          });
        }
      }
    });

    // Baileys 7: mapeamento oficial LID <-> telefone
    sock.ev.on('lid-mapping.update', (mappings) => {
      const list = Array.isArray(mappings) ? mappings : [mappings];
      for (const m of list) {
        if (m?.lid && m?.pn) recordMapping(m.pn, m.lid);
      }
    });

    // Sincronização de contatos
    sock.ev.on('contacts.upsert', async (contacts) => {
      for (const c of contacts || []) {
        recordMapping(c.phoneNumber || c.id, c.lid || c.lidJid || (c.id?.endsWith('@lid') ? c.id : undefined), c.name || c.notify || c.verifiedName);
      }
    });

    sock.ev.on('contacts.set', async ({ contacts }) => {
      console.log(`📇 [Baileys] Agenda recebida: ${contacts?.length || 0} contatos.`);
      for (const c of contacts || []) {
        recordMapping(c.phoneNumber || c.id, c.lid || c.lidJid || (c.id?.endsWith('@lid') ? c.id : undefined), c.name || c.notify || c.verifiedName);
      }
    });

    // Sincronização de conversas (chats)
    sock.ev.on('chats.set', async ({ chats }) => {
      console.log(`💬 [Baileys] Lista de conversas recebida: ${chats?.length || 0} chats.`);
      const embeddedMsgs = [];
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
        if (Array.isArray(ch.messages)) {
          for (const mWrap of ch.messages) {
            const m = mWrap?.message || mWrap;
            if (m?.key && m?.message) embeddedMsgs.push(m);
          }
        }
      }
      if (embeddedMsgs.length > 0) {
        processAndForwardHistoryBatch(embeddedMsgs).catch(() => {});
      }
    });

    sock.ev.on('chats.upsert', async (chats) => {
      const embeddedMsgs = [];
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
        if (Array.isArray(ch.messages)) {
          for (const mWrap of ch.messages) {
            const m = mWrap?.message || mWrap;
            if (m?.key && m?.message) embeddedMsgs.push(m);
          }
        }
      }
      if (embeddedMsgs.length > 0) {
        processAndForwardHistoryBatch(embeddedMsgs).catch(() => {});
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

    // Sincronização inicial de histórico do WhatsApp (messaging-history.set)
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, lidPnMappings }) => {
      console.log(`📥 [Baileys] Sincronização de histórico: ${chats?.length || 0} chats, ${contacts?.length || 0} contatos, ${messages?.length || 0} mensagens.`);
      for (const m of lidPnMappings || []) {
        if (m?.lid && m?.pn) {
          recordMapping(m.pn, m.lid);
        }
      }
      const combinedMessages = Array.isArray(messages) ? [...messages] : [];
      for (const ch of chats || []) {
        recordMapping(ch.id, ch.lidJid, ch.name);
        if (Array.isArray(ch.messages)) {
          for (const mWrap of ch.messages) {
            const m = mWrap?.message || mWrap;
            if (m?.key && m?.message) combinedMessages.push(m);
          }
        }
      }
      for (const c of contacts || []) {
        recordMapping(c.phoneNumber || c.id, c.lid || c.lidJid || (c.id?.endsWith('@lid') ? c.id : undefined), c.name || c.notify || c.verifiedName);
      }
      if (combinedMessages.length > 0) {
        processAndForwardHistoryBatch(combinedMessages).catch(() => {});
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
  if (sock) {
    try {
      sock.ev.removeAllListeners();
    } catch (e) {}
    sock = null;
  }
  clearBridgeMemoryAndAuth();
  res.json({ success: true, state: 'disconnected' });
});

app.post('/message/sendText/:instance', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!sock || connectionState !== 'open') {
      return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }

    const targetJid = getTargetJid(number);
    const msgId = generateMessageIDV2(sock.user?.id);
    sentMessagesCache.set(msgId, { conversation: text });
    console.log(`🚀 [Baileys] Enviando mensagem de texto (${msgId}) para ${targetJid}: "${text}"`);
    const sent = await sock.sendMessage(targetJid, { text }, { messageId: msgId });
    if (sent?.key?.id && sent?.message) {
      sentMessagesCache.set(sent.key.id, sent.message);
    }
    res.json({ success: true, messageId: sent?.key?.id || msgId, jid: targetJid });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/message/sendMedia/:instance', async (req, res) => {
  try {
    const { number, media, mediaType = 'image', caption = '', fileName = 'arquivo' } = req.body;
    if (!sock || connectionState !== 'open') {
      return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }
    if (!media) {
      return res.status(400).json({ error: 'Conteúdo de mídia ausente.' });
    }

    const targetJid = getTargetJid(number);
    let mime = 'image/jpeg';
    let rawBase64 = media;
    const match = String(media).match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mime = match[1];
      rawBase64 = match[2];
    }
    const mediaBuffer = Buffer.from(rawBase64, 'base64');

    let payloadMsg;
    if (mediaType === 'image' || mime.startsWith('image/')) {
      payloadMsg = {
        image: mediaBuffer,
        mimetype: mime,
        caption: caption || undefined,
      };
    } else if (mediaType === 'video' || mime.startsWith('video/')) {
      payloadMsg = {
        video: mediaBuffer,
        mimetype: mime,
        caption: caption || undefined,
      };
    } else {
      payloadMsg = {
        document: mediaBuffer,
        mimetype: mime || 'application/octet-stream',
        fileName: fileName || 'documento',
        caption: caption || undefined,
      };
    }

    console.log(`🚀 [Baileys] Enviando mídia (${mediaType}) para ${targetJid}`);
    const sent = await sock.sendMessage(targetJid, payloadMsg);
    if (sent?.key?.id && sent?.message) {
      sentMessagesCache.set(sent.key.id, sent.message);
    }
    res.json({ success: true, messageId: sent?.key?.id, jid: targetJid });
  } catch (err) {
    console.error('Erro ao enviar mídia:', err);
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
    const audioBuffer = Buffer.from(audio.replace(/^data:audio\/[^;]+;base64,/, ''), 'base64');
    const sent = await sock.sendMessage(targetJid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: true,
    });
    if (sent?.key?.id && sent?.message) {
      sentMessagesCache.set(sent.key.id, sent.message);
    }
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
  } else {
    // Sem sessão ativa em disco: notifica o backend para garantir que nenhuma conversa antiga fique retida
    notifyWebhook({
      event: 'connection.update',
      instance: 'regenflow',
      data: { state: 'close', loggedOut: true },
    }).catch(() => {});
  }
});

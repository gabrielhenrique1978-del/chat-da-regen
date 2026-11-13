import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Aplica correções determinísticas no @whiskeysockets/baileys para suporte completo a:
 * 1. Envio e espelhamento multi-dispositivo (deviceSentMessage) em conversas @lid e @s.whatsapp.net
 * 2. Retry de criptografia Signal direcionado (device_fanout='false' + count + recipient para meLid)
 * 3. Cache imediato da mensagem antes do envio do nó na rede para evitar perda em retries rápidos
 */
export function ensureBaileysPatched() {
  try {
    const sendPath = path.join(
      __dirname,
      'node_modules',
      '@whiskeysockets',
      'baileys',
      'lib',
      'Socket',
      'messages-send.js'
    );
    if (fs.existsSync(sendPath)) {
      let sendCode = fs.readFileSync(sendPath, 'utf8');
      let modified = false;

      if (!sendCode.includes('config.cacheSentMessage')) {
        sendCode = sendCode.replace(
          'msgId = msgId || generateMessageIDV2(sock.user?.id);',
          `msgId = msgId || generateMessageIDV2(sock.user?.id);
        if (typeof config.cacheSentMessage === 'function' && msgId && message && !message.deviceSentMessage && !message.protocolMessage) {
            config.cacheSentMessage(msgId, message);
        }`
        );
        modified = true;
      }

      if (!sendCode.includes("extraAttrs['count'] = participant.count.toString()")) {
        sendCode = sendCode.replace(
          `            const { user, device } = jidDecode(participant.jid);
            devices.push({ user, device });`,
          `            if (participant.count) {
                extraAttrs['count'] = participant.count.toString();
            }
            const { user, device, server: participantServer } = jidDecode(participant.jid);
            devices.push({ user, device, server: participantServer });`
        );
        modified = true;
      }

      if (!sendCode.includes('const meLidUser = meLid ? jidDecode(meLid)?.user : undefined;')) {
        sendCode = sendCode.replace(
          `                const { user: meUser } = jidDecode(meId);
                if (!participant) {
                    devices.push({ user });
                    if (user !== meUser) {
                        devices.push({ user: meUser });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        const additionalDevices = await getUSyncDevices([meId, jid], !!useUserDevicesCache, true);
                        devices.push(...additionalDevices);
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                for (const { user, device } of devices) {
                    const isMe = user === meUser;
                    const jid = jidEncode(isMe && isLid ? authState.creds?.me?.lid.split(':')[0] || user : user, isLid ? 'lid' : 's.whatsapp.net', device);`,
          `                const { user: meUser } = jidDecode(meId);
                const meLid = authState.creds?.me?.lid;
                const meLidUser = meLid ? jidDecode(meLid)?.user : undefined;
                if (!participant) {
                    devices.push({ user });
                    if (user !== meUser && (!meLidUser || user !== meLidUser)) {
                        devices.push({ user: meUser });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        const additionalDevices = await getUSyncDevices([meId, jid], !!useUserDevicesCache, true);
                        devices.push(...additionalDevices);
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                for (const { user, device, server: devServer } of devices) {
                    const isMe = user === meUser || (!!meLidUser && user === meLidUser);
                    const targetServer = devServer || (isLid ? 'lid' : 's.whatsapp.net');
                    const targetUser = isMe && targetServer === 'lid' ? (meLidUser || user) : (isMe && targetServer === 's.whatsapp.net' ? (meUser || user) : user);
                    const jid = jidEncode(targetUser, targetServer, device);`
        );
        modified = true;
      }

      if (sendCode.includes('else if (areJidsSameUser(participant.jid, meId)) {')) {
        sendCode = sendCode.replace(
          'else if (areJidsSameUser(participant.jid, meId)) {',
          'else if (areJidsSameUser(participant.jid, meId) || (!!authState.creds?.me?.lid && areJidsSameUser(participant.jid, authState.creds.me.lid))) {'
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(sendPath, sendCode, 'utf8');
      }
    }

    const recvPath = path.join(
      __dirname,
      'node_modules',
      '@whiskeysockets',
      'baileys',
      'lib',
      'Socket',
      'messages-recv.js'
    );
    if (fs.existsSync(recvPath)) {
      let recvCode = fs.readFileSync(recvPath, 'utf8');
      let modified = false;

      if (recvCode.includes('const sendToAll = !jidDecode(participant)?.device;')) {
        recvCode = recvCode.replace(
          'const sendToAll = !jidDecode(participant)?.device;',
          'const sendToAll = false;'
        );
        modified = true;
      }

      if (recvCode.includes('count: +retryNode.attrs.count')) {
        recvCode = recvCode.replace(
          'count: +retryNode.attrs.count',
          'count: +(retryNode?.attrs?.count || 1)'
        );
        modified = true;
      }

      if (recvCode.includes('if (retryCount > 1 || forceIncludeKeys) {')) {
        recvCode = recvCode.replace(
          `        if (retryCount === 1) {
            //request a resend via phone
            const msgId = await requestPlaceholderResend(msgKey);
            logger.debug(\`sendRetryRequest: requested placeholder resend for message \${msgId}\`);
        }`,
          ''
        );
        recvCode = recvCode.replace(
          'if (retryCount > 1 || forceIncludeKeys) {',
          'if (retryCount >= 1 || forceIncludeKeys) {'
        );
        modified = true;
      }

      if (
        recvCode.includes(
          "const isLid = attrs.from.includes('lid');\n        const isNodeFromMe = areJidsSameUser(attrs.participant || attrs.from, isLid ? authState.creds.me?.lid : authState.creds.me?.id);"
        )
      ) {
        recvCode = recvCode.replace(
          "const isLid = attrs.from.includes('lid');\n        const isNodeFromMe = areJidsSameUser(attrs.participant || attrs.from, isLid ? authState.creds.me?.lid : authState.creds.me?.id);\n        const remoteJid = !isNodeFromMe || isJidGroup(attrs.from) ? attrs.from : attrs.recipient;",
          'const targetSender = attrs.participant || attrs.from;\n        const isNodeFromMe = areJidsSameUser(targetSender, authState.creds.me?.id) || (!!authState.creds.me?.lid && areJidsSameUser(targetSender, authState.creds.me.lid));\n        const remoteJid = (!isNodeFromMe || isJidGroup(attrs.from) ? attrs.from : attrs.recipient) || attrs.from;'
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(recvPath, recvCode, 'utf8');
      }
    }
  } catch (err) {
    console.error('Aviso ao verificar patch Baileys:', err.message);
  }
}

ensureBaileysPatched();

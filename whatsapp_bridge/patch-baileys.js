// Correção para @whiskeysockets/baileys 7.0.0-rc14 (versão fixada no package.json):
// no reenvio (retry) para um aparelho próprio endereçado por LID (ex.: 139818868703467:26@lid),
// o Baileys omitia o atributo `recipient`, e o servidor rejeitava o stanza com erro 479.
// Executado no postinstall e também na inicialização do bridge (idempotente).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function ensureBaileysPatched() {
  const file = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js');
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  const from = 'else if (areJidsSameUser(participant.jid, meId)) {';
  const to = 'else if (areJidsSameUser(participant.jid, meId) || (meLid && areJidsSameUser(participant.jid, meLid))) {';
  if (code.includes(from)) {
    code = code.replace(from, to);
    fs.writeFileSync(file, code, 'utf8');
    console.log('[patch-baileys] retry recipient fix aplicado');
  }
}

ensureBaileysPatched();

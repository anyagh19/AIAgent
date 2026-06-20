// whatsapp_tool.js
// Uses whatsapp-web.js for reliable WhatsApp messaging
// Run `npm install whatsapp-web.js qrcode-terminal` to install

import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

const { Client, LocalAuth, MessageMedia } = pkg;

let client = null;
let clientReady = false;
let qrShown = false;

// ── Initialize WhatsApp client (singleton) ───────────────────────────────────
async function getClient() {
  if (client && clientReady) return client;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    if (!qrShown) {
      console.log('\n🔐 Scan this QR code in WhatsApp (Linked Devices):\n');
      qrcode.generate(qr, { small: true });
      qrShown = true;
    }
  });

  client.on('ready', () => {
    clientReady = true;
    console.log('✅ WhatsApp client ready');
  });

  client.on('disconnected', () => {
    clientReady = false;
    client = null;
  });

  await client.initialize();

  // Wait until ready (max 60 seconds)
  if (!clientReady) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WhatsApp login timeout (60s). Please scan the QR code.')), 60000);
      client.once('ready', () => { clearTimeout(timeout); resolve(); });
    });
  }

  return client;
}

// ── Resolve contact name → phone number ─────────────────────────────────────
async function resolveContact(wa, nameOrNumber) {
  // If it looks like a number (with optional + and digits), use directly
  if (/^\+?[\d\s\-()]{7,}$/.test(nameOrNumber)) {
    const cleaned = nameOrNumber.replace(/[\s\-()]/g, '');
    const number = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
    return `${number}@c.us`;
  }

  // Otherwise search contacts by display name (case-insensitive)
  const contacts = await wa.getContacts();
  const match = contacts.find(
    (c) =>
      c.name?.toLowerCase().includes(nameOrNumber.toLowerCase()) ||
      c.pushname?.toLowerCase().includes(nameOrNumber.toLowerCase())
  );

  if (!match) {
    throw new Error(
      `Contact "${nameOrNumber}" not found. Use their full name or phone number with country code (e.g. +919876543210).`
    );
  }

  return match.id._serialized;
}

// ── Send text message ────────────────────────────────────────────────────────
export async function sendWhatsAppMessage(contactName, message) {
  try {
    const wa = await getClient();
    const chatId = await resolveContact(wa, contactName);
    await wa.sendMessage(chatId, message);

    return {
      content: [{ type: 'text', text: `✅ Message sent to "${contactName}" on WhatsApp.` }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `❌ WhatsApp error: ${err.message}` }],
      isError: true,
    };
  }
}

// ── Send file / image / document ─────────────────────────────────────────────
export async function sendWhatsAppFile(contactName, filePath, caption = '') {
  try {
    const wa = await getClient();
    const chatId = await resolveContact(wa, contactName);

    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const media = MessageMedia.fromFilePath(absolutePath);
    await wa.sendMessage(chatId, media, { caption });

    return {
      content: [
        {
          type: 'text',
          text: `📎 File "${path.basename(absolutePath)}" sent to "${contactName}" on WhatsApp.`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `❌ WhatsApp file error: ${err.message}` }],
      isError: true,
    };
  }
}

// ── Get recent chats (useful for debugging contact names) ────────────────────
export async function listWhatsAppChats(limit = 10) {
  try {
    const wa = await getClient();
    const chats = await wa.getChats();
    const recent = chats.slice(0, limit).map((c) => ({
      name: c.name,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
    }));

    return {
      content: [{ type: 'text', text: `Recent chats:\n${JSON.stringify(recent, null, 2)}` }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `❌ Error listing chats: ${err.message}` }],
      isError: true,
    };
  }
}
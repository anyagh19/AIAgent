import { keyboard, Key, mouse, Button } from "@nut-tree-fork/nut-js";
import { windowManager } from "node-window-manager";
import { exec } from "child_process";
import { promisify } from "util";

import { sendMessage, sendFile, openWhatsAppChat } from "./whatsapp.tool.js";
import { findFile } from "./fileResolver.js";

const execAsync = promisify(exec);
const WHATSAPP_APP_ID = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pressCombo(...keys) {
  for (const k of keys) await keyboard.pressKey(k);
  for (const k of [...keys].reverse()) await keyboard.releaseKey(k);
}

// ─── Key map ──────────────────────────────────────────────────────────────────

const KEY_MAP = {
  enter:     Key.Enter,
  backspace: Key.Backspace,
  escape:    Key.Escape,
  tab:       Key.Tab,
  space:     Key.Space,
  up:        Key.Up,
  down:      Key.Down,
  left:      Key.Left,
  right:     Key.Right,
  delete:    Key.Delete,
  home:      Key.Home,
  end:       Key.End,
  "ctrl+a":  [Key.LeftControl, Key.A],
  "ctrl+c":  [Key.LeftControl, Key.C],
  "ctrl+v":  [Key.LeftControl, Key.V],
  "ctrl+x":  [Key.LeftControl, Key.X],
  "ctrl+z":  [Key.LeftControl, Key.Z],
  "ctrl+f":  [Key.LeftControl, Key.F],
  "ctrl+s":  [Key.LeftControl, Key.S],
  "ctrl+o":  [Key.LeftControl, Key.O],
  "alt+f4":  [Key.LeftAlt, Key.F4],
};

// ─── WhatsApp open + search box focus ─────────────────────────────────────────

async function openWhatsAppReady() {
  let whatsapp = windowManager
    .getWindows()
    .find(w => w.getTitle().toLowerCase().includes("whatsapp"));

  if (!whatsapp) {
    console.log("🚀 Launching WhatsApp...");
    await execAsync(`explorer.exe shell:AppsFolder\\${WHATSAPP_APP_ID}`);

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      whatsapp = windowManager
        .getWindows()
        .find(w => w.getTitle().toLowerCase().includes("whatsapp"));
      if (whatsapp) { console.log("✅ WhatsApp window detected"); break; }
      await sleep(1000);
    }
  }

  if (!whatsapp) throw new Error("WhatsApp did not open within 30 seconds");

  try { whatsapp.restore?.(); whatsapp.bringToTop?.(); } catch (_) {}

  console.log("⏳ Waiting 10s for WhatsApp to fully load...");
  await sleep(10000);

  // Focus search box so agent can type the contact name immediately
  await pressCombo(Key.LeftControl, Key.F);
  await sleep(2000);

  // Clear any old search text
  await pressCombo(Key.LeftControl, Key.A);
  await sleep(300);
  await keyboard.pressKey(Key.Backspace);
  await keyboard.releaseKey(Key.Backspace);
  await sleep(500);

  return "✅ WhatsApp opened — search box is focused and ready";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function computerControl({ action, params = {} }) {
  try {
    switch (action) {

      // ── wait ──────────────────────────────────────────────────────────────────
      // { action: "wait", params: { ms: 3000 } }
      case "wait": {
        const ms = Number(params.ms ?? 2000);
        await sleep(ms);
        return `✅ Waited ${ms}ms`;
      }

      // ── open_app ──────────────────────────────────────────────────────────────
      // WhatsApp: waits 10s + auto-focuses search box before returning.
      // Correct agent sequence after this:
      //   type(contact) → wait(4000) → press_key("down") → wait(800)
      //   → press_key("enter") → wait(3000) → type(message) → press_key("enter")
      //
      // { action: "open_app", params: { app: "WhatsApp" } }
      case "open_app": {
        const app = (params.app ?? "").toLowerCase().trim();
        if (app === "whatsapp") return await openWhatsAppReady();
        await execAsync(`start "" "${params.app}"`);
        await sleep(3000);
        return `✅ Opened "${params.app}"`;
      }

      // ── send_whatsapp_message ─────────────────────────────────────────────────
      // { action: "send_whatsapp_message", params: { contact: "papa", message: "hi" } }
      case "send_whatsapp_message": {
        const { contact, message } = params;
        if (!contact) throw new Error("Missing param: contact");
        if (!message) throw new Error("Missing param: message");
        const result = await sendMessage(contact, message);
        return result.content[0].text;
      }

      // ── send_whatsapp_file ────────────────────────────────────────────────────
      // Accepts fileName + location (no full path needed!) OR a full filePath.
      //
      // ✅ Easy way — just give file name and folder:
      // { action: "send_whatsapp_file",
      //   params: { contact: "papa", fileName: "result.pdf", location: "downloads" } }
      //
      // location options: downloads | desktop | documents | pictures | videos | music
      // location is optional — omit it to search all folders automatically.
      //
      // ✅ Full path way (also works):
      // { action: "send_whatsapp_file",
      //   params: { contact: "papa", filePath: "C:\\Users\\Anya\\Downloads\\result.pdf" } }
      case "send_whatsapp_file": {
        const { contact, filePath, fileName, location } = params;
        if (!contact) throw new Error("Missing param: contact");

        let resolvedPath;

        if (filePath) {
          // Full path provided — use directly
          resolvedPath = filePath;

        } else if (fileName) {
          // Only file name given — find it automatically across common folders
          console.log(`🔎 Looking for "${fileName}"${location ? ` in ${location}` : " in all common folders"}...`);
          resolvedPath = await findFile(fileName, location ?? null);
          console.log(`✅ Found: ${resolvedPath}`);

        } else {
          throw new Error("Provide either fileName (e.g. 'result.pdf') or filePath");
        }

        const result = await sendFile(contact, resolvedPath);
        return result.content[0].text;
      }

      // ── open_whatsapp_chat ────────────────────────────────────────────────────
      // { action: "open_whatsapp_chat", params: { contact: "papa" } }
      case "open_whatsapp_chat": {
        const { contact } = params;
        if (!contact) throw new Error("Missing param: contact");
        const result = await openWhatsAppChat(contact);
        return result.content[0].text;
      }

      // ── type ──────────────────────────────────────────────────────────────────
      // { action: "type", params: { text: "Hello" } }
      case "type": {
        const text = params.text ?? "";
        await keyboard.type(text);
        return `✅ Typed: "${text}"`;
      }

      // ── press_key ─────────────────────────────────────────────────────────────
      // { action: "press_key", params: { key: "enter" } }
      // { action: "press_key", params: { key: "ctrl+f" } }
      case "press_key": {
        const keyStr = (params.key ?? "").toLowerCase().trim();
        const mapped = KEY_MAP[keyStr];
        if (!mapped) {
          throw new Error(`Unknown key "${params.key}". Valid: ${Object.keys(KEY_MAP).join(", ")}`);
        }
        if (Array.isArray(mapped)) {
          await pressCombo(...mapped);
        } else {
          await keyboard.pressKey(mapped);
          await keyboard.releaseKey(mapped);
        }
        return `✅ Pressed: "${params.key}"`;
      }

      // ── click ─────────────────────────────────────────────────────────────────
      // { action: "click", params: { x: 400, y: 300 } }
      case "click": {
        const { x, y, button = "left" } = params;
        if (x == null || y == null) throw new Error("Missing params: x, y");
        await mouse.setPosition({ x: Number(x), y: Number(y) });
        await sleep(200);
        await mouse.click(button === "right" ? Button.RIGHT : Button.LEFT);
        return `✅ Clicked ${button} at (${x}, ${y})`;
      }

      // ── scroll ────────────────────────────────────────────────────────────────
      // { action: "scroll", params: { direction: "down", amount: 3 } }
      case "scroll": {
        const amount = Number(params.amount ?? 3);
        const dir = (params.direction ?? "down").toLowerCase();
        dir === "down" ? await mouse.scrollDown(amount) : await mouse.scrollUp(amount);
        return `✅ Scrolled ${dir} by ${amount}`;
      }

      default:
        throw new Error(
          `Unknown action: "${action}". ` +
          `Valid: wait, open_app, send_whatsapp_message, send_whatsapp_file, ` +
          `open_whatsapp_chat, type, press_key, click, scroll`
        );
    }
  } catch (err) {
    console.error(`❌ computerControl [${action}]:`, err.message);
    return `❌ ${err.message}`;
  }
}
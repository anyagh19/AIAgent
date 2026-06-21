import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { windowManager } from "node-window-manager";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const WHATSAPP_APP_ID = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Press a key combo (e.g. Ctrl+F) then release in reverse order */
async function pressCombo(...keys) {
  for (const k of keys) await keyboard.pressKey(k);
  for (const k of [...keys].reverse()) await keyboard.releaseKey(k);
}

// ─── Core: open WhatsApp window and wait for full load ────────────────────────

async function openWhatsApp() {
  // Check if WhatsApp is already open
  let whatsapp = windowManager
    .getWindows()
    .find(w => w.getTitle().toLowerCase().includes("whatsapp"));

  if (!whatsapp) {
    console.log("🚀 Launching WhatsApp...");
    await execAsync(
      `explorer.exe shell:AppsFolder\\${WHATSAPP_APP_ID}`
    );

    // Poll until the window appears (max 30 seconds)
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      whatsapp = windowManager
        .getWindows()
        .find(w => w.getTitle().toLowerCase().includes("whatsapp"));
      if (whatsapp) {
        console.log("✅ WhatsApp window detected");
        break;
      }
      await sleep(1000);
    }
  }

  if (!whatsapp) {
    throw new Error("WhatsApp window not found after 30 seconds");
  }

  // Bring to front
  try {
    whatsapp.restore?.();
    whatsapp.bringToTop?.();
  } catch (err) {
    console.log("⚠️  Window activation warning:", err.message);
  }

  // Wait for chats/UI to fully render
  console.log("⏳ Waiting 10s for WhatsApp to fully load...");
  await sleep(10000);

  return whatsapp;
}

// ─── Core: search for a contact and open chat ─────────────────────────────────

async function openChat(contactName) {
  await openWhatsApp();

  console.log(`🔍 Searching for contact: "${contactName}"`);

  // Step 1 — Open the search panel with Ctrl+F
  await pressCombo(Key.LeftControl, Key.F);
  console.log("✅ Search panel opened (Ctrl+F)");
  await sleep(2500);

  // Step 2 — Clear any leftover text in the search box
  await pressCombo(Key.LeftControl, Key.A);
  await sleep(300);
  await keyboard.pressKey(Key.Backspace);
  await keyboard.releaseKey(Key.Backspace);
  await sleep(500);

  // Step 3 — Type the contact name
  console.log(`⌨️  Typing: "${contactName}"`);
  await keyboard.type(contactName);

  // Step 4 — Wait for search results to fully populate
  await sleep(4000);

  // Step 5 — ⚠️ FIX: Press Down arrow to highlight the first result
  //           Without this, Enter does nothing in WhatsApp Desktop
  console.log("⬇️  Selecting first search result...");
  await keyboard.pressKey(Key.Down);
  await keyboard.releaseKey(Key.Down);
  await sleep(800);

  // Step 6 — Press Enter to open the highlighted chat
  console.log("📂 Opening chat...");
  await keyboard.pressKey(Key.Enter);
  await keyboard.releaseKey(Key.Enter);

  // Step 7 — Wait for the chat panel to fully load
  await sleep(3000);

  // ⚠️ FIX: DO NOT press Escape here — it closes the chat panel.
  //         After Enter, WhatsApp automatically focuses the message input box.

  console.log(`✅ Chat opened: "${contactName}" — message box is ready`);
}

// ─── Exported: send a text message ────────────────────────────────────────────

export async function sendMessage(contactName, message) {
  try {
    await openChat(contactName);

    // Small buffer before typing the message
    console.log("⏳ Waiting before typing message...");
    await sleep(2000);

    // Type the message into the message input box
    console.log(`💬 Typing message: "${message}"`);
    await keyboard.type(message);
    await sleep(1000);

    // Send with Enter
    await keyboard.pressKey(Key.Enter);
    await keyboard.releaseKey(Key.Enter);

    console.log("✅ Message sent successfully");

    return {
      content: [
        { type: "text", text: `✅ Message sent to "${contactName}"` }
      ]
    };
  } catch (err) {
    console.error("❌ sendMessage error:", err.message);
    return {
      content: [{ type: "text", text: `❌ ${err.message}` }],
      isError: true
    };
  }
}

// ─── Exported: send a file ────────────────────────────────────────────────────

export async function sendFile(contactName, filePath) {
  try {
    await openChat(contactName);

    console.log(`📎 Attaching file: "${filePath}"`);

    // Open the file-attach dialog with Ctrl+O
    await pressCombo(Key.LeftControl, Key.O);
    await sleep(3000); // wait for the OS file dialog

    // Type the full file path and confirm
    await keyboard.type(filePath);
    await sleep(1000);

    await keyboard.pressKey(Key.Enter);
    await keyboard.releaseKey(Key.Enter);

    // Wait for WhatsApp to show the file preview
    await sleep(5000);

    // Confirm send
    console.log("📤 Confirming send...");
    await keyboard.pressKey(Key.Enter);
    await keyboard.releaseKey(Key.Enter);
    await sleep(2000);

    console.log("✅ File sent successfully");

    return {
      content: [
        { type: "text", text: `✅ File sent to "${contactName}"` }
      ]
    };
  } catch (err) {
    console.error("❌ sendFile error:", err.message);
    return {
      content: [{ type: "text", text: `❌ ${err.message}` }],
      isError: true
    };
  }
}

// ─── Exported: open a chat only (no message) ──────────────────────────────────

export async function openWhatsAppChat(contactName) {
  try {
    await openChat(contactName);
    return {
      content: [
        { type: "text", text: `✅ Opened chat with "${contactName}"` }
      ]
    };
  } catch (err) {
    console.error("❌ openWhatsAppChat error:", err.message);
    return {
      content: [{ type: "text", text: `❌ ${err.message}` }],
      isError: true
    };
  }
}
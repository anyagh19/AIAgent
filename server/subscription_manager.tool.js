// subscription_manager.tool.js
import fs from 'fs/promises';
import path from 'path';
import { notify } from './desktop_notification.tool.js';
// import { sendMessage } from './whatsapp.tool.js'; // optional

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(SUBSCRIPTIONS_FILE); } catch {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2));
  }
}

async function loadSubscriptions() {
  await ensureFile();
  const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveSubscriptions(subs) {
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

// ── Add a subscription ──
export async function addSubscription(name, cost, renewalDate, category = 'entertainment') {
  try {
    const subs = await loadSubscriptions();
    const sub = {
      id: Date.now().toString(),
      name,
      cost: parseFloat(cost),
      renewalDate: new Date(renewalDate).toISOString(),
      category,
      active: true,
    };
    subs.push(sub);
    await saveSubscriptions(subs);
    return {
      content: [{ type: 'text', text: `✅ Added subscription: "${name}" – $${cost} (renewal: ${new Date(renewalDate).toLocaleDateString()})` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── List all subscriptions ──
export async function listSubscriptions() {
  try {
    const subs = await loadSubscriptions();
    if (subs.length === 0) return { content: [{ type: 'text', text: '📭 No subscriptions tracked.' }] };
    let output = `📋 **Subscriptions (${subs.length})**\n\n`;
    for (const s of subs) {
      output += `💰 ${s.name} – $${s.cost.toFixed(2)} (${s.category})\n`;
      output += `📅 Renewal: ${new Date(s.renewalDate).toLocaleDateString()}\n`;
      output += `📊 ${s.active ? '✅ Active' : '❌ Inactive'}\n\n`;
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Check upcoming renewals (next 7 days) ──
export async function checkRenewals() {
  try {
    const subs = await loadSubscriptions();
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const upcoming = subs.filter(s => {
      const renewal = new Date(s.renewalDate);
      return renewal >= now && renewal <= nextWeek && s.active;
    });
    if (upcoming.length === 0) {
      return { content: [{ type: 'text', text: '📅 No renewals due in the next 7 days.' }] };
    }
    let output = `📅 **Upcoming Renewals**\n\n`;
    for (const s of upcoming) {
      output += `💰 ${s.name}: $${s.cost.toFixed(2)} due ${new Date(s.renewalDate).toLocaleDateString()}\n`;
    }
    // Send alert for renewals in < 2 days
    const urgent = upcoming.filter(s => (new Date(s.renewalDate) - now) < 2 * 24 * 60 * 60 * 1000);
    if (urgent.length) {
      const msg = urgent.map(s => `${s.name} ($${s.cost})`).join(', ');
      await notify('Subscription Renewal Alert', `🔔 ${msg} due in < 2 days.`);
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Cancel a subscription (mark inactive) ──
export async function cancelSubscription(id) {
  try {
    const subs = await loadSubscriptions();
    const sub = subs.find(s => s.id === id);
    if (!sub) return { content: [{ type: 'text', text: '❌ Subscription not found.' }], isError: true };
    sub.active = false;
    await saveSubscriptions(subs);
    return { content: [{ type: 'text', text: `🗑️ Cancelled: "${sub.name}"` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Auto‑check (for cron) ──
export async function autoCheckRenewals() {
  return await checkRenewals();
}
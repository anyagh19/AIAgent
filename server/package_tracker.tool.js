// package_tracker.tool.js
import fs from 'fs/promises';
import path from 'path';
import { load } from 'cheerio';
import { notify } from './desktop_notification.tool.js';
// import { sendMessage } from './whatsapp.tool.js'; // optional

const DATA_DIR = path.join(process.cwd(), 'data');
const PACKAGES_FILE = path.join(DATA_DIR, 'packages.json');

// ── Ensure file exists ──
async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(PACKAGES_FILE); } catch {
    await fs.writeFile(PACKAGES_FILE, JSON.stringify([], null, 2));
  }
}

async function loadPackages() {
  await ensureFile();
  const data = await fs.readFile(PACKAGES_FILE, 'utf-8');
  return JSON.parse(data);
}

async function savePackages(pkgs) {
  await fs.writeFile(PACKAGES_FILE, JSON.stringify(pkgs, null, 2));
}

// ── Carrier URL generators ──
function getTrackingUrl(carrier, trackingNumber) {
  const carriers = {
    ups: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
    fedex: `https://www.fedex.com/fedextrack?tracknumbers=${encodeURIComponent(trackingNumber)}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNumber)}`,
    amazon: `https://www.amazon.com/gp/your-account/order-history?search=${encodeURIComponent(trackingNumber)}`,
  };
  return carriers[carrier.toLowerCase()] || null;
}

// ── Scrape status (simplified) ──
// ── Scrape status (simplified) ──
async function fetchPackageStatus(carrier, trackingNumber) {
  const url = getTrackingUrl(carrier, trackingNumber);
  if (!url) throw new Error(`Unsupported carrier: ${carrier}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = load(html);

  let status = 'In transit';
  let location = 'Unknown';

  // ── Amazon specific ──
  if (carrier === 'amazon') {
    // Look for status in the order details page
    // Common selectors for Amazon order status
    const statusSelectors = [
      '.a-color-state',              // e.g., "Shipped", "Delivered"
      '.a-text-bold',                // sometimes bold text
      '.a-row .a-size-medium',       // delivery date or status
      '.order-status',               // another class
      '.shipment-status',            // shipment status
      '.a-row .a-color-success',     // delivered success color
      '.a-row .a-color-error',       // cancelled or issue
    ];
    let statusText = '';
    for (const sel of statusSelectors) {
      const el = $(sel).first();
      if (el.length) {
        statusText = el.text().trim();
        if (statusText) break;
      }
    }

    // If no specific selector found, search the whole page for keywords
    if (!statusText) {
      const bodyText = $('body').text();
      const keywords = ['delivered', 'shipped', 'out for delivery', 'arriving', 'cancelled', 'returned'];
      for (const kw of keywords) {
        if (bodyText.toLowerCase().includes(kw)) {
          statusText = kw.charAt(0).toUpperCase() + kw.slice(1);
          break;
        }
      }
    }

    // Map to standard status strings
    if (statusText) {
      const lower = statusText.toLowerCase();
      if (lower.includes('delivered')) status = 'Delivered';
      else if (lower.includes('shipped')) status = 'Shipped';
      else if (lower.includes('out for delivery')) status = 'Out for delivery';
      else if (lower.includes('arriving')) status = 'Arriving soon';
      else if (lower.includes('cancelled')) status = 'Cancelled';
      else if (lower.includes('returned')) status = 'Returned';
      else status = statusText;
    }

    // Try to get location from delivery info
    const locEl = $('.a-row .a-size-base, .delivery-location, .shipment-location').first();
    if (locEl.length) location = locEl.text().trim();

    return { status, location, timestamp: new Date().toISOString() };
  }

  // ── Other carriers (UPS, FedEx, USPS, DHL) ──
  // ... (keep existing code for other carriers)
  if (carrier === 'ups') {
    const el = $('.ups-status').first();
    if (el.length) status = el.text().trim();
  } else if (carrier === 'fedex') {
    const el = $('.statusText').first();
    if (el.length) status = el.text().trim();
  } else if (carrier === 'usps') {
    const el = $('.status-text').first();
    if (el.length) status = el.text().trim();
  } else if (carrier === 'dhl') {
    const el = $('.delivery-status').first();
    if (el.length) status = el.text().trim();
  }

  // Location for other carriers
  const locEl = $('.location, .city, .delivery-location').first();
  if (locEl.length) location = locEl.text().trim();

  return { status, location, timestamp: new Date().toISOString() };
}

// ── 1. Add a package ──
export async function addPackage(trackingNumber, carrier, name = '') {
  try {
    const pkgs = await loadPackages();
    if (pkgs.find(p => p.trackingNumber === trackingNumber && p.carrier === carrier)) {
      return { content: [{ type: 'text', text: '⚠️ This tracking number is already being tracked.' }], isError: true };
    }
    const pkg = {
      id: Date.now().toString(),
      trackingNumber,
      carrier: carrier.toLowerCase(),
      name: name || `${carrier} ${trackingNumber.slice(-6)}`,
      added: new Date().toISOString(),
      status: 'Added',
      lastChecked: null,
      history: [],
      active: true,
    };
    pkgs.push(pkg);
    await savePackages(pkgs);
    return {
      content: [{ type: 'text', text: `✅ Package added: "${pkg.name}" (${carrier} – ${trackingNumber})` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 2. List all packages ──
export async function listPackages() {
  try {
    const pkgs = await loadPackages();
    if (pkgs.length === 0) {
      return { content: [{ type: 'text', text: '📭 No packages being tracked.' }] };
    }
    let output = `📦 **Tracked Packages (${pkgs.length})**\n\n`;
    for (const p of pkgs) {
      output += `📦 **${p.name}**\n`;
      output += `   🔢 ${p.carrier}: ${p.trackingNumber}\n`;
      output += `   📊 Status: ${p.status || 'Unknown'}\n`;
      output += `   📅 Added: ${new Date(p.added).toLocaleDateString()}\n`;
      if (p.lastChecked) output += `   🕒 Last check: ${new Date(p.lastChecked).toLocaleString()}\n`;
      output += `   ${p.active ? '✅ Active' : '❌ Inactive'}\n\n`;
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 3. Check all packages (for cron) ──
export async function checkAllPackages(notifyOnChange = true) {
  try {
    const pkgs = await loadPackages();
    let changes = [];
    for (const p of pkgs) {
      if (!p.active) continue;
      try {
        const result = await fetchPackageStatus(p.carrier, p.trackingNumber);
        const oldStatus = p.status;
        p.status = result.status;
        p.lastChecked = result.timestamp;
        if (!p.history) p.history = [];
        p.history.push(result);
        if (oldStatus && oldStatus !== result.status) {
          changes.push({ name: p.name, oldStatus, newStatus: result.status });
        }
      } catch (err) {
        console.warn(`Failed to check ${p.carrier} ${p.trackingNumber}:`, err.message);
        p.status = `Error: ${err.message}`;
      }
    }
    await savePackages(pkgs);

    if (notifyOnChange && changes.length > 0) {
      const msg = changes.map(c => `📦 ${c.name}: ${c.oldStatus} → ${c.newStatus}`).join('\n');
      await notify('📦 Package Status Changed', msg);
      // Optional WhatsApp: await sendMessage('Your Contact', msg);
    }

    return {
      content: [{ type: 'text', text: `✅ Checked ${pkgs.filter(p => p.active).length} packages. ${changes.length} changes detected.` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 4. Remove a package ──
export async function removePackage(id) {
  try {
    const pkgs = await loadPackages();
    const idx = pkgs.findIndex(p => p.id === id);
    if (idx === -1) {
      return { content: [{ type: 'text', text: '❌ Package not found.' }], isError: true };
    }
    const removed = pkgs.splice(idx, 1)[0];
    await savePackages(pkgs);
    return {
      content: [{ type: 'text', text: `🗑️ Removed package: "${removed.name}"` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 5. Auto-check (for cron) ──
export async function autoPackageCheck() {
  return await checkAllPackages(true);
}
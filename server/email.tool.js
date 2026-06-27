/**
 * emailTool.js — Gmail Automation + AI Triage + Snoretoast
 *
 * Original features (unchanged):
 *   searchEmailsBrowser, openLatestEmail, openEmailFrom, openEmailOnDate,
 *   openEmailContaining, openGmailSearch, composeEmailBrowser, sendEmailViaGmail
 *
 * New features:
 *   fetchUnreadEmails()        — Puppeteer reads full inbox content (headless) + returns count
 *   triageInbox()              — AI summarizes + drafts replies, fires toast
 *   startPeriodicTriage()      — Runs triage on a timer (default 30 min)
 *   stopPeriodicTriage()       — Cancels the timer
 *   getLastTriageResults()     — Returns saved triage JSON
 *   openDraftInGmail(index)    — Opens AI draft in Gmail compose (new tab)
 *   sendToastNotification()    — Windows Snoretoast via node-notifier
 *   getUnreadCount()           — Returns just the number of unread emails
 *
 * Install new deps:
 *   npm install node-notifier @google/generative-ai
 */

import { exec }         from 'child_process';
import { promisify }    from 'util';
import puppeteer        from 'puppeteer';
import path             from 'path';
import { fileURLToPath } from 'url';
import fs               from 'fs';
import notifier         from 'node-notifier';
import { GoogleGenerativeAI } from '@google/generative-ai';

const execAsync = promisify(exec);
const __dirname  = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// AI SETUP
// ─────────────────────────────────────────────────────────────────────────────
const geminiKey = process.env.GEMINI_API_KEY;
let aiModel     = null;

if (geminiKey) {
  const genAI = new GoogleGenerativeAI(geminiKey);
  aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  console.log('✅ Gemini AI ready for email triage.');
} else {
  console.warn('⚠️  GEMINI_API_KEY not set — summaries/drafts will be skipped.');
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE & PATHS
// ─────────────────────────────────────────────────────────────────────────────
let periodicTimer = null;

const TRIAGE_FILE = path.join(__dirname, 'email_triage.json');
const ICON_PATH   = path.join(__dirname, 'assets', 'mail.png');
const iconExists  = fs.existsSync(ICON_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SINGLETONS – one for headless (triage), one for visible (sending)
// ─────────────────────────────────────────────────────────────────────────────
let headlessBrowserInstance = null;
let headlessBrowserPromise  = null;

let visibleBrowserInstance = null;
let visibleBrowserPromise  = null;

async function getVisibleBrowser() {
  if (visibleBrowserInstance && visibleBrowserInstance.isConnected()) {
    console.log('♻️  Reusing visible browser instance');
    return visibleBrowserInstance;
  }
  if (visibleBrowserPromise) {
    console.log('⏳ Waiting for visible browser launch...');
    const browser = await visibleBrowserPromise;
    if (browser && browser.isConnected()) return browser;
    visibleBrowserPromise = null;
    visibleBrowserInstance = null;
  }

  console.log('🚀 Launching visible browser instance...');
  visibleBrowserPromise = (async () => {
    let executablePath = null;
    const platform = process.platform;

    if (platform === 'win32') {
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      for (const p of edgePaths) {
        if (fs.existsSync(p)) { executablePath = p; break; }
      }
    } else if (platform === 'darwin') {
      const macPath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
      if (fs.existsSync(macPath)) executablePath = macPath;
    } else if (platform === 'linux') {
      try {
        const { execSync } = await import('child_process');
        const which = execSync('which microsoft-edge-stable || which microsoft-edge || which edge', { encoding: 'utf8' }).trim();
        if (which) executablePath = which;
      } catch (_) {}
    }

    const launchOptions = {
      headless: false,
      userDataDir: path.join(__dirname, '.gmail_profile'),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
      console.log(`✅ Using visible Edge: ${executablePath}`);
    } else {
      console.log('⚠️  Edge not found — falling back to Puppeteer Chromium.');
    }

    const browser = await puppeteer.launch(launchOptions);
    visibleBrowserInstance = browser;
    process.on('exit', () => { if (visibleBrowserInstance) visibleBrowserInstance.close(); });
    console.log('✅ Visible browser launched.');
    return browser;
  })();

  return await visibleBrowserPromise;
}

async function getHeadlessBrowser() {
  if (headlessBrowserInstance && headlessBrowserInstance.isConnected()) {
    console.log('♻️  Reusing headless browser instance');
    return headlessBrowserInstance;
  }
  if (headlessBrowserPromise) {
    console.log('⏳ Waiting for headless browser launch...');
    const browser = await headlessBrowserPromise;
    if (browser && browser.isConnected()) return browser;
    headlessBrowserPromise = null;
    headlessBrowserInstance = null;
  }

  console.log('🚀 Launching headless browser instance...');
  headlessBrowserPromise = (async () => {
    let executablePath = null;
    const platform = process.platform;

    if (platform === 'win32') {
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      for (const p of edgePaths) {
        if (fs.existsSync(p)) { executablePath = p; break; }
      }
    } else if (platform === 'darwin') {
      const macPath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
      if (fs.existsSync(macPath)) executablePath = macPath;
    } else if (platform === 'linux') {
      try {
        const { execSync } = await import('child_process');
        const which = execSync('which microsoft-edge-stable || which microsoft-edge || which edge', { encoding: 'utf8' }).trim();
        if (which) executablePath = which;
      } catch (_) {}
    }

    const launchOptions = {
      headless: true, // <-- Headless mode for triage
      userDataDir: path.join(__dirname, '.gmail_profile_headless'), // separate profile to avoid conflicts
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
      console.log(`✅ Using headless Edge: ${executablePath}`);
    } else {
      console.log('⚠️  Edge not found — falling back to Puppeteer Chromium.');
    }

    const browser = await puppeteer.launch(launchOptions);
    headlessBrowserInstance = browser;
    process.on('exit', () => { if (headlessBrowserInstance) headlessBrowserInstance.close(); });
    console.log('✅ Headless browser launched.');
    return browser;
  })();

  return await headlessBrowserPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// [UPDATED] FETCH UNREAD EMAILS – returns { emails, totalUnread }
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchUnreadEmails(maxCount = 5) {
  const browser = await getHeadlessBrowser();
  const page    = await browser.newPage();
  const emails  = [];
  let totalUnread = 0;

  try {
    console.log('📬 Opening Gmail inbox (headless)...');
    await page.goto('https://mail.google.com/mail/u/0/#inbox', {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });

    // Check login state – detect if we're on the login page
    const loginInput = await page.$('input[type="email"]');
    if (loginInput) {
      console.warn('⚠️  Gmail not logged in. Please log in once manually in headless mode.');
      await page.close();
      return { emails: [], totalUnread: 0 };
    }

    // Wait for inbox to load – look for any row
    await page.waitForSelector('tr.zA', { timeout: 20_000 }).catch(() => {
      throw new Error('Gmail inbox did not load. Try again.');
    });

    // Get unread count from the UI (Gmail displays it in the title or a badge)
    // Method 1: count rows with class 'zE' (unread)
    const unreadRows = await page.$$('tr.zA.zE');
    totalUnread = unreadRows.length;
    console.log(`📊 Total unread emails: ${totalUnread}`);

    if (totalUnread === 0) {
      await page.close();
      return { emails: [], totalUnread: 0 };
    }

    const toProcess = Math.min(totalUnread, maxCount);
    console.log(`📊 Processing ${toProcess} of ${totalUnread} unread`);

    // Process each unread row
    for (let i = 0; i < toProcess; i++) {
      // Re-fetch the row each time because the DOM changes after clicks
      const meta = await page.evaluate(() => {
        // Find the first unread row (still unread)
        const row = document.querySelector('tr.zA.zE');
        if (!row) return null;
        const subjectEl = row.querySelector('span.bog');
        const senderEl  = row.querySelector('span.zF');
        const snippetEl = row.querySelector('span.y2');
        const dateEl    = row.querySelector('.xW span, span.xW');
        return {
          subject:     subjectEl?.innerText?.trim() || '(no subject)',
          sender:      senderEl?.getAttribute('name') || senderEl?.innerText?.trim() || 'Unknown',
          senderEmail: senderEl?.getAttribute('email') || '',
          snippet:     snippetEl?.innerText?.trim() || '',
          date:        dateEl?.innerText?.trim() || '',
        };
      });

      if (!meta) { console.log('⚠️  No more unread rows.'); break; }
      console.log(`📧 [${i + 1}/${toProcess}] "${meta.subject}" — ${meta.sender}`);

      // Click to open the email
      await page.evaluate(() => {
        const row = document.querySelector('tr.zA.zE');
        if (row) row.click();
      });

      // Wait for body to load
      try {
        await page.waitForSelector('div.a3s', { timeout: 15_000 });
        await new Promise(r => setTimeout(r, 900));

        const content = await page.evaluate(() => {
          const bodyEl = document.querySelector('div.a3s.aiL') || document.querySelector('div.a3s');
          let bodyText = bodyEl?.innerText?.trim() || '';
          if (!bodyText) {
            try {
              const frame = document.querySelector('iframe.lvg, iframe[class*="gmail"]');
              bodyText = frame?.contentDocument?.body?.innerText?.trim() || '';
            } catch (_) {}
          }
          const subjEl   = document.querySelector('h2.hP');
          const sendEl   = document.querySelector('span.gD');
          const dateEl   = document.querySelector('.g3');
          return {
            fullSubject: subjEl?.innerText?.trim() || '',
            senderName:  sendEl?.innerText?.trim() || '',
            senderEmail: sendEl?.getAttribute('email') || '',
            date:        dateEl?.innerText?.trim() || '',
            body:        bodyText.slice(0, 4000),
          };
        });

        emails.push({ ...meta, ...content });
      } catch (err) {
        console.warn(`⚠️  Could not read body: ${err.message} — using snippet`);
        emails.push({ ...meta, body: meta.snippet });
      }

      // Return to inbox
      await page.goto('https://mail.google.com/mail/u/0/#inbox', {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
      await page.waitForSelector('tr.zA', { timeout: 10_000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }

  } catch (err) {
    console.error('❌ fetchUnreadEmails:', err.message);
  } finally {
    await page.close();
  }

  return { emails, totalUnread };
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] GET UNREAD COUNT ONLY
// ─────────────────────────────────────────────────────────────────────────────
export async function getUnreadCount() {
  const { totalUnread } = await fetchUnreadEmails(1);
  return {
    content: [{ type: 'text', text: `📬 You have ${totalUnread} unread email${totalUnread !== 1 ? 's' : ''}.` }],
    count: totalUnread,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] AI — SUMMARISE EMAIL
// ─────────────────────────────────────────────────────────────────────────────
async function summariseEmail(email) {
  if (!aiModel) return '(AI unavailable — set GEMINI_API_KEY)';
  const prompt = `
Summarise this email in 2–3 concise bullet points. Focus on what the sender wants or is communicating.

From: ${email.sender} <${email.senderEmail}>
Subject: ${email.subject}
Date: ${email.date}

Body:
${email.body}

Format strictly as:
• [point 1]
• [point 2]
• [point 3 if truly needed]
`.trim();
  try {
    const result = await aiModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    return `Summary error: ${err.message}`;
  }
}

async function draftReply(email) {
  if (!aiModel) return '(AI unavailable — set GEMINI_API_KEY)';
  const prompt = `
Write a professional, concise reply to the email below.
Rules:
- Match the formality of the original (casual ↔ formal)
- Under 120 words
- No subject line — body only
- End with: Best regards,\n[Your Name]
- Output only the reply text, nothing else

From: ${email.sender} <${email.senderEmail}>
Subject: ${email.subject}

${email.body}
`.trim();
  try {
    const result = await aiModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    return `Draft error: ${err.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] WINDOWS SNORETOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
export function sendToastNotification(title, body, openUrl = 'https://mail.google.com/mail/u/0/#inbox') {
  console.log(`🔔 Toast → ${title}`);
  const options = {
    appID:   'Email Triage MCP',
    title,
    message: body.slice(0, 220),
    sound:   'Notification.Default',
    wait:    true,
    timeout: 12,
  };
  if (iconExists) options.icon = ICON_PATH;

  notifier.notify(options, (err, response) => {
    if (err) { console.warn('Notification err:', err.message); return; }
    if (response === 'activate' || response === 'clicked') {
      const cmd = process.platform === 'win32'
        ? `start "" "${openUrl}"`
        : process.platform === 'darwin'
          ? `open "${openUrl}"`
          : `xdg-open "${openUrl}"`;
      exec(cmd);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] SAVE / LOAD TRIAGE RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function saveTriageResults(results) {
  const payload = {
    lastChecked: new Date().toISOString(),
    count: results.length,
    emails: results,
  };
  fs.writeFileSync(TRIAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`💾 Triage saved → ${TRIAGE_FILE}`);
}

export function getLastTriageResults() {
  if (!fs.existsSync(TRIAGE_FILE)) {
    return {
      content: [{ type: 'text', text: 'No triage results yet. Run triage_inbox first.' }],
    };
  }
  try {
    const data = JSON.parse(fs.readFileSync(TRIAGE_FILE, 'utf8'));
    const lines = data.emails.map((e, i) =>
      `[${i}] From: ${e.sender}\n    Subject: ${e.subject}\n    Summary: ${e.summary || '—'}`
    ).join('\n\n');
    return {
      content: [{ type: 'text', text: `Last checked: ${data.lastChecked}\n\n${lines}` }],
      data,
    };
  } catch (err) {
    return { content: [{ type: 'text', text: `Read error: ${err.message}` }], isError: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [UPDATED] FULL TRIAGE PIPELINE — uses { emails, totalUnread }
// ─────────────────────────────────────────────────────────────────────────────
export async function triageInbox(maxCount = 5) {
  console.log('\n🔍 Starting inbox triage...');
  const { emails: rawEmails, totalUnread } = await fetchUnreadEmails(maxCount);

  if (!rawEmails.length && totalUnread === 0) {
    sendToastNotification('📬 Inbox Triage', '✅ No unread emails.');
    return { content: [{ type: 'text', text: `📬 Inbox Triage — ${totalUnread} unread emails. ✅ Inbox zero!` }] };
  }

  if (!rawEmails.length && totalUnread > 0) {
    sendToastNotification('📬 Inbox Triage', `${totalUnread} unread emails (content not readable).`);
    return {
      content: [{
        type: 'text',
        text: `📊 Found ${totalUnread} unread emails, but couldn't read content. Try again or check Gmail login.`
      }]
    };
  }

  console.log(`🤖 AI processing ${rawEmails.length} email(s)...`);
  const results = [];
  for (const email of rawEmails) {
    const [summary, draft] = await Promise.all([
      summariseEmail(email),
      draftReply(email),
    ]);
    results.push({
      ...email,
      summary,
      draft,
      triaged_at: new Date().toISOString(),
    });
    console.log(`  ✅ "${email.subject}"`);
  }

  saveTriageResults(results);

  const toastLines = results.slice(0, 3).map(e => `• ${e.sender}: ${e.subject}`).join('\n');
  sendToastNotification(
    `📬 Inbox Triage — ${results.length} email(s)`,
    `${toastLines}\n\nClick to open Gmail`
  );

  const textOutput = results.map((e, i) => `
╔══ Email ${i + 1} ════════════════════════════════════════════════
  From:    ${e.sender} <${e.senderEmail}>
  Subject: ${e.subject}
  Date:    ${e.date}

  📋 Summary:
${e.summary}

  ✏️  Draft Reply (index ${i} — use open_draft_in_gmail to load):
${e.draft}
`).join('\n');

  return {
    content: [{ type: 'text', text: textOutput }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] PERIODIC TRIAGE
// ─────────────────────────────────────────────────────────────────────────────
export function startPeriodicTriage(intervalMinutes = 30, maxCount = 5) {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    console.log('⏹  Cleared existing periodic timer.');
  }
  const ms = intervalMinutes * 60 * 1000;
  console.log(`⏰ Periodic triage: every ${intervalMinutes} min, up to ${maxCount} emails.`);

  triageInbox(maxCount).catch(console.error);

  periodicTimer = setInterval(() => {
    const t = new Date().toLocaleTimeString();
    console.log(`\n⏰ Periodic triage triggered at ${t}`);
    triageInbox(maxCount).catch(console.error);
  }, ms);

  sendToastNotification(
    '📬 Email Triage Started',
    `Checking inbox every ${intervalMinutes} min.\nClick to open Gmail.`
  );

  return {
    content: [{
      type: 'text',
      text: `✅ Periodic triage started — every ${intervalMinutes} min.\n` +
            `Run stop_periodic_triage to cancel.`,
    }],
  };
}

export function stopPeriodicTriage() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
    console.log('⏹  Periodic triage stopped.');
    sendToastNotification('📬 Email Triage', 'Periodic check stopped.');
    return { content: [{ type: 'text', text: '⏹ Periodic triage stopped.' }] };
  }
  return { content: [{ type: 'text', text: 'No periodic triage was running.' }] };
}

// ─────────────────────────────────────────────────────────────────────────────
// [NEW] OPEN AI DRAFT IN GMAIL COMPOSE
// ─────────────────────────────────────────────────────────────────────────────
export async function openDraftInGmail(emailIndex = 0) {
  if (!fs.existsSync(TRIAGE_FILE)) {
    return { content: [{ type: 'text', text: 'No triage results — run triage_inbox first.' }] };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(TRIAGE_FILE, 'utf8'));
  } catch (err) {
    return { content: [{ type: 'text', text: `JSON read error: ${err.message}` }], isError: true };
  }

  const email = data.emails?.[emailIndex];
  if (!email) {
    return {
      content: [{
        type: 'text',
        text: `No email at index ${emailIndex}. Last triage had ${data.emails?.length ?? 0} email(s).`,
      }],
    };
  }

  const to      = email.senderEmail || email.sender;
  const subject = `Re: ${email.fullSubject || email.subject}`;
  const body    = email.draft || '(draft unavailable)';

  console.log(`📝 Opening draft compose for: "${subject}" → ${to}`);
  return await composeEmailBrowser(to, subject, body);
}

// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL FUNCTIONS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function searchEmailsBrowser(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://mail.google.com/mail/u/0/#search/${encodedQuery}`;
    const command = process.platform === 'win32' ? `start "" "${url}"`
                  : process.platform === 'darwin' ? `open "${url}"`
                  : `xdg-open "${url}"`;
    await execAsync(command);
    return { content: [{ type: 'text', text: `🌐 Opened Gmail search: "${query}"` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ ${err.message}` }], isError: true };
  }
}

export async function openLatestEmail() {
  return searchEmailsBrowser('in:inbox');
}

export async function openEmailFrom(sender) {
  return searchEmailsBrowser(`from:${sender}`);
}

export async function openEmailOnDate(date) {
  let after, before;
  if (date === 'today') {
    after = before = new Date().toISOString().split('T')[0];
  } else if (date === 'yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    after = before = d.toISOString().split('T')[0];
  } else {
    after = before = date;
  }
  const afterDate  = new Date(after);
  const beforeDate = new Date(before);
  beforeDate.setDate(beforeDate.getDate() + 1);
  const afterStr  = afterDate.toISOString().split('T')[0];
  const beforeStr = beforeDate.toISOString().split('T')[0];
  return searchEmailsBrowser(`after:${afterStr} before:${beforeStr}`);
}

export async function openEmailContaining(text) {
  return searchEmailsBrowser(`"${text}"`);
}

export async function openGmailSearch({ query = '', sender = '', date = '', contains = '' }) {
  let q = query;
  if (sender)   q += ` from:${sender}`;
  if (contains) q += ` "${contains}"`;
  if (date) {
    let after, before;
    if (date === 'today') {
      after = before = new Date().toISOString().split('T')[0];
    } else if (date === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      after = before = d.toISOString().split('T')[0];
    } else {
      after = before = date;
    }
    const afterDate  = new Date(after);
    const beforeDate = new Date(before);
    beforeDate.setDate(beforeDate.getDate() + 1);
    q += ` after:${afterDate.toISOString().split('T')[0]} before:${beforeDate.toISOString().split('T')[0]}`;
  }
  if (!q.trim()) q = 'in:inbox';
  return searchEmailsBrowser(q);
}

export async function composeEmailBrowser(to = '', subject = '', body = '') {
  try {
    const url = `https://mail.google.com/mail/u/0/?view=cm&fs=1` +
                `&to=${encodeURIComponent(to)}` +
                `&su=${encodeURIComponent(subject)}` +
                `&body=${encodeURIComponent(body)}`;
    const command = process.platform === 'win32' ? `start "" "${url}"`
                  : process.platform === 'darwin' ? `open "${url}"`
                  : `xdg-open "${url}"`;
    await execAsync(command);
    return { content: [{ type: 'text', text: `📧 Compose opened → To: ${to}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ ${err.message}` }], isError: true };
  }
}

export async function sendEmailViaGmail(to, subject, body) {
  try {
    const browser = await getVisibleBrowser(); // <-- Uses visible browser
    const page    = await browser.newPage();

    const url = `https://mail.google.com/mail/u/0/?view=cm&fs=1` +
                `&to=${encodeURIComponent(to)}` +
                `&su=${encodeURIComponent(subject)}` +
                `&body=${encodeURIComponent(body)}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
    await page.waitForSelector('div[role="button"][aria-label*="Send"]', { timeout: 30_000 });
    await page.click('div[role="button"][aria-label*="Send"]');
    await new Promise(r => setTimeout(r, 3000));

    const confirmed = await page.evaluate(() => {
      const el = document.querySelector('span[role="status"]');
      return el?.textContent?.toLowerCase()?.includes('sent') ?? false;
    });

    await page.close();
    return confirmed
      ? { content: [{ type: 'text', text: `✅ Email sent to ${to}.` }] }
      : { content: [{ type: 'text', text: `⚠️ May have sent — check Gmail "Sent".` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ ${err.message}` }], isError: true };
  }
}
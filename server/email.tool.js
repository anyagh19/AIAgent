// ── Browser-based search (already exists) ──
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export async function searchEmailsBrowser(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://mail.google.com/mail/u/0/#search/${encodedQuery}`;
    const platform = process.platform;
    let command;
    if (platform === 'win32') command = `start "" "${url}"`;
    else if (platform === 'darwin') command = `open "${url}"`;
    else command = `xdg-open "${url}"`;
    await execAsync(command);
    return {
      content: [{ type: "text", text: `🌐 Opened Gmail with search: "${query}"` }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `❌ Failed to open Gmail: ${error.message}` }],
      isError: true
    };
  }
}

// ── Convenience tools ──
export async function openLatestEmail() {
  return searchEmailsBrowser('in:inbox'); // Shows newest first by default
}

export async function openEmailFrom(sender) {
  return searchEmailsBrowser(`from:${sender}`);
}

export async function openEmailOnDate(date) {
  // date: 'today', 'yesterday', or 'YYYY-MM-DD'
  let after, before;
  if (date === 'today') {
    after = before = new Date().toISOString().split('T')[0];
  } else if (date === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    after = before = d.toISOString().split('T')[0];
  } else {
    after = before = date;
  }
  // Gmail's date search: after:YYYY-MM-DD before:YYYY-MM-DD
  // But if we want exact day, we use after and before on the same day plus 1 day
  const afterDate = new Date(after);
  const beforeDate = new Date(before);
  beforeDate.setDate(beforeDate.getDate() + 1);
  const afterStr = afterDate.toISOString().split('T')[0];
  const beforeStr = beforeDate.toISOString().split('T')[0];
  return searchEmailsBrowser(`after:${afterStr} before:${beforeStr}`);
}

export async function openEmailContaining(text) {
  return searchEmailsBrowser(`"${text}"`);
}

// Optional: combine all
export async function openGmailSearch({ query = '', sender = '', date = '', contains = '' }) {
  let gmailQuery = query;
  if (sender) gmailQuery += ` from:${sender}`;
  if (contains) gmailQuery += ` "${contains}"`;
  if (date) {
    let after, before;
    if (date === 'today') {
      after = before = new Date().toISOString().split('T')[0];
    } else if (date === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      after = before = d.toISOString().split('T')[0];
    } else {
      after = before = date;
    }
    const afterDate = new Date(after);
    const beforeDate = new Date(before);
    beforeDate.setDate(beforeDate.getDate() + 1);
    const afterStr = afterDate.toISOString().split('T')[0];
    const beforeStr = beforeDate.toISOString().split('T')[0];
    gmailQuery += ` after:${afterStr} before:${beforeStr}`;
  }
  if (!gmailQuery.trim()) gmailQuery = 'in:inbox';
  return searchEmailsBrowser(gmailQuery);
}
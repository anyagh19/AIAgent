// calendar.tool.js – Browser‑only version
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Helper to open any URL ──
async function openUrl(url) {
  try {
    const platform = process.platform;
    let command;
    if (platform === 'win32') command = `start "" "${url}"`;
    else if (platform === 'darwin') command = `open "${url}"`;
    else command = `xdg-open "${url}"`;
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
}

// ── 1. Open Google Calendar (default view) ──
export async function openCalendar() {
  const url = 'https://calendar.google.com/calendar/u/0/r';
  await openUrl(url);
  return {
    content: [{ type: 'text', text: '📅 Opened Google Calendar in your browser.' }]
  };
}

// ── 2. Open calendar on a specific date ──
export async function openCalendarOnDate(date) {
  // date: 'YYYY-MM-DD' or 'today' or 'yesterday'
  let dateStr;
  if (date === 'today') {
    dateStr = new Date().toISOString().split('T')[0];
  } else if (date === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = d.toISOString().split('T')[0];
  } else {
    dateStr = date;
  }
  const url = `https://calendar.google.com/calendar/u/0/r/day/${dateStr}`;
  await openUrl(url);
  return {
    content: [{ type: 'text', text: `📅 Opened Google Calendar for ${dateStr}.` }]
  };
}

// ── 3. Create a new event (opens the event edit form) ──
export async function createEventBrowser(summary, startTime, endTime, description = '', location = '') {
  try {
    // Convert times to ISO strings or timestamps
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date/time format. Use ISO strings (e.g., "2026-06-21T10:00:00").');
    }
    // Google Calendar uses milliseconds since epoch for `ctz` parameters
    const startMs = start.getTime();
    const endMs = end.getTime();
    // Encode parameters
    const encodedSummary = encodeURIComponent(summary);
    const encodedDesc = encodeURIComponent(description);
    const encodedLocation = encodeURIComponent(location);
    // Build URL
    const url = `https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodedSummary}&details=${encodedDesc}&location=${encodedLocation}&dates=${startMs}/${endMs}`;
    await openUrl(url);
    return {
      content: [{ type: 'text', text: `✅ Opened Google Calendar to create event: "${summary}"\nStart: ${start.toLocaleString()}\nEnd: ${end.toLocaleString()}` }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `❌ Failed to create event: ${error.message}` }],
      isError: true
    };
  }
}

// ── 4. Open calendar in month view ──
export async function openCalendarMonth(date) {
  // Similar to openCalendarOnDate but using month view
  let dateStr;
  if (date === 'today') {
    dateStr = new Date().toISOString().split('T')[0];
  } else if (date === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = d.toISOString().split('T')[0];
  } else {
    dateStr = date;
  }
  const url = `https://calendar.google.com/calendar/u/0/r/month/${dateStr}`;
  await openUrl(url);
  return {
    content: [{ type: 'text', text: `📅 Opened Google Calendar month view for ${dateStr}.` }]
  };
}
// calendar.tool.js – Browser‑only version
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Helper: open any URL ──
async function openUrl(url) {
  try {
    const platform = process.platform;
    let command;
    if (platform === 'win32')       command = `start "" "${url}"`;
    else if (platform === 'darwin') command = `open "${url}"`;
    else                            command = `xdg-open "${url}"`;
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
}

// ── Helper: "YYYY-MM-DD" → "YYYY/M/D" for Google Calendar URL paths ──
function toGCalDatePath(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${year}/${month}/${day}`;
}

// ── Helper: Date → "YYYYMMDDTHHmmssZ" for Google Calendar event times ──
function toGCalEventTime(date) {
  // e.g. "2026-06-21T10:00:00.000Z" → "20260621T100000Z"
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// ── Resolve "today" / "yesterday" / "YYYY-MM-DD" to a date string ──
function resolveDateStr(date) {
  if (date === 'today') {
    return new Date().toISOString().split('T')[0];
  } else if (date === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  return date; // already "YYYY-MM-DD"
}

// ── 1. Open Google Calendar (default view) ──
export async function openCalendar() {
  await openUrl('https://calendar.google.com/calendar/u/0/r');
  return {
    content: [{ type: 'text', text: '📅 Opened Google Calendar in your browser.' }]
  };
}

// ── 2. Open calendar on a specific date (day view) ──
export async function openCalendarOnDate(date) {
  const dateStr = resolveDateStr(date);
  // FIX: Google Calendar day view expects /r/day/YYYY/M/D
  const url = `https://calendar.google.com/calendar/u/0/r/day/${toGCalDatePath(dateStr)}`;
  await openUrl(url);
  return {
    content: [{ type: 'text', text: `📅 Opened Google Calendar day view for ${dateStr}.` }]
  };
}

// ── 3. Create a new event (opens the event edit form pre-filled) ──
export async function createEventBrowser(summary, startTime, endTime, description = '', location = '') {
  try {
    const start = new Date(startTime);
    const end   = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date/time format. Use ISO strings (e.g., "2026-06-21T10:00:00").');
    }

    // FIX: dates param must be "YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ", NOT milliseconds
    const dates = `${toGCalEventTime(start)}/${toGCalEventTime(end)}`;

    const url = `https://calendar.google.com/calendar/u/0/r/eventedit`
      + `?text=${encodeURIComponent(summary)}`
      + `&details=${encodeURIComponent(description)}`
      + `&location=${encodeURIComponent(location)}`
      + `&dates=${dates}`;

    await openUrl(url);
    return {
      content: [{
        type: 'text',
        text: `✅ Opened Google Calendar to create event: "${summary}"\nStart: ${start.toLocaleString()}\nEnd: ${end.toLocaleString()}`
      }]
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
  const dateStr = resolveDateStr(date);
  // FIX: month view expects /r/month/YYYY/M  (no day needed)
  const [year, month] = dateStr.split('-').map(Number);
  const url = `https://calendar.google.com/calendar/u/0/r/month/${year}/${month}`;
  await openUrl(url);
  return {
    content: [{ type: 'text', text: `📅 Opened Google Calendar month view for ${dateStr}.` }]
  };
}
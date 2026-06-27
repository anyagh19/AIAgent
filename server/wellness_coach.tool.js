// wellness_coach.tool.js
import fs from 'fs/promises';
import path from 'path';
import { notify } from './desktop_notification.tool.js';
// import { sendMessage } from './whatsapp.tool.js'; // optional

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'wellness_sessions.json');
const GOALS_FILE = path.join(DATA_DIR, 'wellness_goals.json');

// ── Ensure files exist ──
async function ensureFile(filePath, defaultContent = {}) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(filePath); } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

async function loadSessions() {
  await ensureFile(SESSIONS_FILE, []);
  const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveSessions(sessions) {
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

async function loadGoals() {
  await ensureFile(GOALS_FILE, { dailyLimit: 6, breakInterval: 45, breakDuration: 5 });
  const data = await fs.readFile(GOALS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveGoals(goals) {
  await fs.writeFile(GOALS_FILE, JSON.stringify(goals, null, 2));
}

// ── In-memory session state ──
let activeSession = null;
let breakTimer = null;
let sessionTimer = null;

// ── 1. Start a session ──
export async function startWellnessSession(type = 'work') {
  try {
    if (activeSession) {
      return { content: [{ type: 'text', text: '⚠️ A session is already active. Stop it first.' }], isError: true };
    }
    const goals = await loadGoals();
    activeSession = {
      id: Date.now().toString(),
      type,
      start: new Date().toISOString(),
      end: null,
      duration: 0,
      breaks: [],
    };
    // Start timers
    console.log(`🧘 Wellness session started (${type})`);
    await notify('🧘 Wellness', `Started ${type} session.`);
    return {
      content: [{ type: 'text', text: `✅ ${type.charAt(0).toUpperCase()+type.slice(1)} session started.` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 2. Stop current session ──
export async function stopWellnessSession() {
  try {
    if (!activeSession) {
      return { content: [{ type: 'text', text: '⚠️ No active session.' }], isError: true };
    }
    activeSession.end = new Date().toISOString();
    const start = new Date(activeSession.start);
    const end = new Date(activeSession.end);
    activeSession.duration = Math.round((end - start) / 60000); // minutes
    // Save to history
    const sessions = await loadSessions();
    sessions.push(activeSession);
    await saveSessions(sessions);
    const durationMsg = `${activeSession.duration} minutes`;
    await notify('🧘 Wellness', `Session ended. Duration: ${durationMsg}`);
    activeSession = null;
    return {
      content: [{ type: 'text', text: `✅ Session ended. Duration: ${durationMsg}` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 3. Take a break ──
export async function takeBreak() {
  try {
    if (!activeSession) {
      return { content: [{ type: 'text', text: '⚠️ No active session.' }], isError: true };
    }
    const breakStart = new Date().toISOString();
    await notify('🧘 Break Time', 'Take a 5‑minute break!');
    // Simulate break duration (we'll just log it)
    const breakEnd = new Date(Date.now() + 5 * 60000).toISOString();
    activeSession.breaks.push({ start: breakStart, end: breakEnd });
    return {
      content: [{ type: 'text', text: '⏰ Break taken. Resume after 5 minutes.' }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 4. Set goals ──
export async function setWellnessGoals(dailyLimitHours, breakIntervalMinutes, breakDurationMinutes) {
  try {
    const goals = { dailyLimit: dailyLimitHours, breakInterval: breakIntervalMinutes, breakDuration: breakDurationMinutes };
    await saveGoals(goals);
    return {
      content: [{ type: 'text', text: `✅ Goals set:\n- Daily limit: ${dailyLimitHours}h\n- Break every ${breakIntervalMinutes} min\n- Break duration: ${breakDurationMinutes} min` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 5. Get today's summary ──
export async function getTodayWellness() {
  try {
    const sessions = await loadSessions();
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.start.startsWith(today));
    const totalMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
    const totalBreaks = todaySessions.reduce((sum, s) => sum + (s.breaks ? s.breaks.length : 0), 0);
    const goals = await loadGoals();

    let output = `🧘 **Wellness Report – ${new Date().toLocaleDateString()}**\n\n`;
    output += `⏱️ Total screen time: ${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m\n`;
    output += `☕ Breaks taken: ${totalBreaks}\n`;
    output += `🎯 Daily limit: ${goals.dailyLimit}h\n`;
    const remaining = Math.max(0, goals.dailyLimit * 60 - totalMinutes);
    output += `📉 Remaining time: ${Math.floor(remaining/60)}h ${remaining%60}m\n`;
    if (activeSession) {
      output += `\n🔴 Current session: active (started at ${new Date(activeSession.start).toLocaleTimeString()})`;
    } else {
      output += `\n🟢 No active session.`;
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 6. Auto‑check (called every minute by cron) ──
export async function autoWellnessCheck() {
  try {
    if (!activeSession) return { content: [{ type: 'text', text: 'No active session.' }] };
    const goals = await loadGoals();
    const start = new Date(activeSession.start);
    const now = new Date();
    const elapsedMinutes = Math.round((now - start) / 60000);

    // Check if break is needed
    if (elapsedMinutes > 0 && elapsedMinutes % goals.breakInterval === 0) {
      // Check if we already took a break at this interval (avoid duplicate)
      const lastBreak = activeSession.breaks && activeSession.breaks.length > 0
        ? new Date(activeSession.breaks[activeSession.breaks.length - 1].start)
        : null;
      if (!lastBreak || (now - lastBreak) > (goals.breakInterval * 60 * 1000 * 0.9)) {
        await notify('🧘 Time for a break!', `You've been working for ${elapsedMinutes} minutes. Take a ${goals.breakDuration}‑minute break.`);
        // Optionally auto‑take break? We'll just notify.
      }
    }

    // Check daily limit
    const sessions = await loadSessions();
    const today = now.toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.start.startsWith(today));
    const totalToday = todaySessions.reduce((sum, s) => sum + s.duration, 0) + elapsedMinutes;
    if (totalToday >= goals.dailyLimit * 60) {
      await notify('⏰ Daily screen time limit reached!', `You've exceeded your daily limit of ${goals.dailyLimit}h. Consider logging off.`);
    }

    return { content: [{ type: 'text', text: '✅ Wellness check completed.' }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 7. Reset (stop and clear session) ──
export async function resetWellnessSession() {
  if (activeSession) {
    await stopWellnessSession();
  }
  return { content: [{ type: 'text', text: '✅ Session reset.' }] };
}
// job_tracker.tool.js
import fs from 'fs/promises';
import path from 'path';
import { notify } from './desktop_notification.tool.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(JOBS_FILE); } catch {
    await fs.writeFile(JOBS_FILE, JSON.stringify([], null, 2));
  }
}

async function loadJobs() {
  await ensureFile();
  const data = await fs.readFile(JOBS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveJobs(jobs) {
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// ── Add a job application ──
export async function addJob(company, role, status = 'applied', deadline = null, notes = '') {
  try {
    const jobs = await loadJobs();
    const job = {
      id: Date.now().toString(),
      company,
      role,
      status, // applied, interview, offer, rejected
      deadline: deadline ? new Date(deadline).toISOString() : null,
      notes,
      appliedDate: new Date().toISOString(),
      active: true,
    };
    jobs.push(job);
    await saveJobs(jobs);
    return {
      content: [{ type: 'text', text: `✅ Job added: ${role} at ${company} (${status})` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── List jobs ──
export async function listJobs(filter = 'all') {
  try {
    let jobs = await loadJobs();
    if (filter !== 'all') jobs = jobs.filter(j => j.status === filter);
    if (jobs.length === 0) return { content: [{ type: 'text', text: `📭 No jobs with status "${filter}".` }] };
    let output = `💼 **Job Applications (${jobs.length})**\n\n`;
    for (const j of jobs) {
      output += `🏢 ${j.company} – ${j.role}\n`;
      output += `📊 ${j.status} (applied: ${new Date(j.appliedDate).toLocaleDateString()})\n`;
      if (j.deadline) output += `⏰ Deadline: ${new Date(j.deadline).toLocaleDateString()}\n`;
      if (j.notes) output += `📝 ${j.notes}\n`;
      output += `ID: ${j.id}\n\n`;
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Update job status ──
export async function updateJobStatus(id, newStatus, notes = '') {
  try {
    const jobs = await loadJobs();
    const job = jobs.find(j => j.id === id);
    if (!job) return { content: [{ type: 'text', text: '❌ Job not found.' }], isError: true };
    job.status = newStatus;
    if (notes) job.notes += `\n[${new Date().toLocaleDateString()}] ${notes}`;
    await saveJobs(jobs);
    return { content: [{ type: 'text', text: `✅ Updated ${job.company} – ${job.role} to "${newStatus}"` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Check pending follow-ups (applications with no update in > 7 days) ──
export async function checkFollowUps() {
  try {
    const jobs = await loadJobs();
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const pending = jobs.filter(j => new Date(j.appliedDate) < weekAgo && j.status === 'applied' && j.active);
    if (pending.length === 0) {
      return { content: [{ type: 'text', text: '📭 No follow‑ups needed.' }] };
    }
    let output = `🔔 **Follow‑ups needed**\n\n`;
    for (const j of pending) {
      output += `${j.company} – ${j.role} (applied ${new Date(j.appliedDate).toLocaleDateString()})\n`;
    }
    await notify('Job Follow‑up Reminder', output);
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}
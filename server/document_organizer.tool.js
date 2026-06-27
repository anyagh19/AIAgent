// document_organizer.tool.js
import fs from 'fs/promises';
import path from 'path';
import { watch } from 'chokidar';
import { notify } from './desktop_notification.tool.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WATCH_DIR = path.join(process.cwd(), 'user_files', 'incoming');
const ORGANIZED_DIR = path.join(process.cwd(), 'user_files', 'organized');

// Ensure directories exist
await fs.mkdir(WATCH_DIR, { recursive: true });
await fs.mkdir(ORGANIZED_DIR, { recursive: true });

// ── AI summarisation ──
async function summarizeFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const summary = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize the following document in 1‑2 sentences. Also suggest a category: invoice, report, contract, or other.' },
        { role: 'user', content: content.slice(0, 4000) }
      ]
    });
    return summary.choices[0].message.content;
  } catch {
    return 'Unable to summarize (binary or large file)';
  }
}

// ── Organise and rename file ──
export async function organizeFile(filePath) {
  try {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);

    // Determine category (simple check)
    let category = 'other';
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('invoice') || lowerName.includes('bill')) category = 'invoices';
    else if (lowerName.includes('report')) category = 'reports';
    else if (lowerName.includes('contract') || lowerName.includes('agreement')) category = 'contracts';

    // Create category subfolder
    const categoryDir = path.join(ORGANIZED_DIR, category);
    await fs.mkdir(categoryDir, { recursive: true });

    // Get AI summary
    const summary = await summarizeFile(filePath);

    // New filename with date
    const date = new Date().toISOString().split('T')[0];
    const newName = `${date}-${base}${ext}`;
    const newPath = path.join(categoryDir, newName);

    // Move file
    await fs.rename(filePath, newPath);

    // Log the operation
    const log = `[${new Date().toISOString()}] ${fileName} → ${category}/${newName}\nSummary: ${summary}\n---\n`;
    await fs.appendFile(path.join(ORGANIZED_DIR, 'organizer.log'), log);

    // Send notification
    await notify('📄 Document Organized', `${fileName} → ${category}/${newName}`);

    return {
      content: [{ type: 'text', text: `✅ Organized: ${fileName} → ${category}/${newName}\nSummary: ${summary}` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── Start file watcher (background) ──
let watcher = null;

export function startDocumentWatcher() {
  if (watcher) return { content: [{ type: 'text', text: '⚠️ Watcher already running.' }] };
  watcher = watch(WATCH_DIR, { ignored: /^\./, persistent: true });
  watcher.on('add', async (filePath) => {
    console.log(`📄 New file detected: ${filePath}`);
    await organizeFile(filePath);
  });
  return { content: [{ type: 'text', text: `👀 Watching ${WATCH_DIR} for new files.` }] };
}

export function stopDocumentWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    return { content: [{ type: 'text', text: '⏹️ Watcher stopped.' }] };
  }
  return { content: [{ type: 'text', text: '⚠️ No watcher running.' }] };
}

// ── Manual organise existing files ──
export async function organizeExistingFiles() {
  try {
    const files = await fs.readdir(WATCH_DIR);
    let results = [];
    for (const file of files) {
      const filePath = path.join(WATCH_DIR, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const result = await organizeFile(filePath);
        results.push(result.content[0].text);
      }
    }
    return { content: [{ type: 'text', text: `✅ Organized ${results.length} files.\n\n${results.join('\n')}` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}
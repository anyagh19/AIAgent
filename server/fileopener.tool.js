// file_opener.tool.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
const execAsync = promisify(exec);

export async function openFile(filePath) {
  try {
    const resolved = path.resolve(filePath);
    await fs.access(resolved);
    await execAsync(`start "" "${resolved}"`);
    return { content: [{ type: "text", text: `📄 Opened file: ${resolved}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `❌ Cannot open file: ${err.message}` }], isError: true };
  }
}

export async function searchAndOpenFile(fileName, baseDir = process.env.USERPROFILE) {
  // Simple recursive search (depth limited to avoid hanging)
  const results = [];
  async function search(dir, depth = 0) {
    if (depth > 3) return; // limit depth
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await search(fullPath, depth + 1);
        } else if (entry.name.toLowerCase().includes(fileName.toLowerCase())) {
          results.push(fullPath);
          if (results.length >= 5) break;
        }
      }
    } catch (err) { /* ignore permission errors */ }
  }
  await search(baseDir);
  if (results.length === 0) {
    return { content: [{ type: "text", text: `No file found containing "${fileName}"` }], isError: true };
  }
  // Open the first result
  await openFile(results[0]);
  return { content: [{ type: "text", text: `🔍 Found and opened: ${results[0]}\nOther matches: ${results.slice(1).join(', ')}` }] };
}
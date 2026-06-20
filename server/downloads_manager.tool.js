// downloads_manager.tool.js
import fs from 'fs/promises';
import path from 'path';
import { openFile } from './fileopener.tool.js';

const DOWNLOADS = path.join(process.env.USERPROFILE, 'Downloads');

export async function listDownloads(filter = '') {
  try {
    const files = await fs.readdir(DOWNLOADS);
    const filtered = files.filter(f => f.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) return { content: [{ type: "text", text: `No files matching "${filter}" in Downloads.` }] };
    const list = filtered.slice(0, 20).map(f => `📄 ${f}`).join('\n');
    return { content: [{ type: "text", text: `📁 Downloads (showing ${filtered.length} of ${files.length}):\n${list}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error reading Downloads: ${err.message}` }], isError: true };
  }
}

export async function openLatestDownload() {
  try {
    const files = await fs.readdir(DOWNLOADS);
    const stats = await Promise.all(files.map(async f => ({
      name: f,
      mtime: (await fs.stat(path.join(DOWNLOADS, f))).mtime
    })));
    stats.sort((a,b) => b.mtime - a.mtime);
    if (stats.length === 0) return { content: [{ type: "text", text: "Downloads folder is empty." }] };
    const latest = stats[0].name;
    await openFile(path.join(DOWNLOADS, latest));
    return { content: [{ type: "text", text: `📂 Opened latest download: ${latest}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

export async function openDownloadedPDF(fileNamePart) {
  try {
    const files = await fs.readdir(DOWNLOADS);
    const pdf = files.find(f => f.toLowerCase().includes(fileNamePart.toLowerCase()) && f.endsWith('.pdf'));
    if (!pdf) return { content: [{ type: "text", text: `No PDF matching "${fileNamePart}" in Downloads.` }], isError: true };
    await openFile(path.join(DOWNLOADS, pdf));
    return { content: [{ type: "text", text: `📖 Opened PDF: ${pdf}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}
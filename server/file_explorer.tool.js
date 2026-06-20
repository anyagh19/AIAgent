// file_explorer.tool.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
const execAsync = promisify(exec);

export async function openFolder(folderPath, selectFile = null) {
  try {
    const resolvedPath = path.resolve(folderPath);
    // Check if path exists
    await fs.access(resolvedPath);
    
    let command;
    if (selectFile) {
      const filePath = path.join(resolvedPath, selectFile);
      await fs.access(filePath);
      command = `explorer /select,"${filePath}"`; // Opens folder with file highlighted
    } else {
      command = `explorer "${resolvedPath}"`;
    }
    await execAsync(command);
    return { content: [{ type: "text", text: `📂 Opened folder: ${resolvedPath}${selectFile ? ` (selected: ${selectFile})` : ''}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `❌ Cannot open folder: ${err.message}` }], isError: true };
  }
}

export async function openDownloads(subfolder = '', selectFile = null) {
  const downloadsPath = path.join(process.env.USERPROFILE, 'Downloads', subfolder);
  return openFolder(downloadsPath, selectFile);
}

// For Windows known folders
export async function openDocuments(subfolder = '') {
  const docsPath = path.join(process.env.USERPROFILE, 'Documents', subfolder);
  return openFolder(docsPath);
}

export async function openDesktop(subfolder = '') {
  const desktopPath = path.join(process.env.USERPROFILE, 'Desktop', subfolder);
  return openFolder(desktopPath);
}
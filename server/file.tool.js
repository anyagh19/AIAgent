// file.tool.js
import fs from 'fs/promises';
import path from 'path';

const BASE_DIR = process.env.FILE_TOOL_BASE_DIR || './user_files';

// Ensure base directory exists
await fs.mkdir(BASE_DIR, { recursive: true });

function sanitizePath(filePath) {
  const resolved = path.resolve(BASE_DIR, filePath);
  if (!resolved.startsWith(path.resolve(BASE_DIR))) {
    throw new Error("Access denied: path outside allowed directory");
  }
  return resolved;
}

export async function listFiles(directory = "") {
  try {
    const dirPath = sanitizePath(directory);
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const listing = files.map(f => `${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n');
    return { content: [{ type: "text", text: listing || "(empty directory)" }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

export async function readFile(filePath) {
  try {
    const fullPath = sanitizePath(filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return { content: [{ type: "text", text: content }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Cannot read file: ${err.message}` }], isError: true };
  }
}

export async function writeFile(filePath, content) {
  try {
    const fullPath = sanitizePath(filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    return { content: [{ type: "text", text: `File written successfully: ${filePath}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Write error: ${err.message}` }], isError: true };
  }
}
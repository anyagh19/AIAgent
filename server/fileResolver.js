import { promises as fs } from "fs";
import os from "os";
import path from "path";

const HOME = os.homedir();

// ─── Common folders ───────────────────────────────────────────────────────────

export const LOCATIONS = {
  downloads: path.join(HOME, "Downloads"),
  desktop:   path.join(HOME, "Desktop"),
  documents: path.join(HOME, "Documents"),
  pictures:  path.join(HOME, "Pictures"),
  videos:    path.join(HOME, "Videos"),
  music:     path.join(HOME, "Music"),
};

// ─── Find a file by name ──────────────────────────────────────────────────────
//
// Usage:
//   findFile("result.pdf", "downloads")  → C:\Users\Anya\Downloads\result.pdf
//   findFile("result.pdf")               → searches all common folders
//   findFile("C:\\full\\path\\file.pdf") → returns as-is if already absolute

export async function findFile(fileName, locationHint = null) {

  // Already a full absolute path — return directly
  if (path.isAbsolute(fileName)) {
    await fs.access(fileName); // throws if file doesn't exist
    return fileName;
  }

  // Build search order: hinted folder first, then everything else
  const hinted = locationHint ? [LOCATIONS[locationHint]].filter(Boolean) : [];
  const others  = Object.values(LOCATIONS).filter(d => !hinted.includes(d));
  const order   = [...hinted, ...others];

  // Flat search — file directly inside each folder
  for (const dir of order) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      console.log(`✅ Found: ${candidate}`);
      return candidate;
    } catch (_) {
      // not here, try next
    }
  }

  // Deep search — 2 levels inside Downloads as last resort
  const deep = await searchDeep(LOCATIONS.downloads, fileName, 2);
  if (deep) {
    console.log(`✅ Found (deep): ${deep}`);
    return deep;
  }

  throw new Error(
    `File "${fileName}" not found in: ${order.join(", ")}`
  );
}

// ─── Helper: recursive search ─────────────────────────────────────────────────

async function searchDeep(dir, fileName, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
    if (entry.isDirectory() && depth > 0) {
      const found = await searchDeep(full, fileName, depth - 1);
      if (found) return found;
    }
  }
  return null;
}
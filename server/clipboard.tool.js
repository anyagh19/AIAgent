import clipboardy from 'clipboardy';
import fs from 'fs/promises';
import path from 'path';

const CLIPBOARD_HISTORY_FILE = path.join(process.cwd(), 'data', 'clipboard-history.json');
const MAX_HISTORY = 100;

async function ensureHistoryFile() {
  try {
    await fs.mkdir(path.dirname(CLIPBOARD_HISTORY_FILE), { recursive: true });
    try {
      await fs.access(CLIPBOARD_HISTORY_FILE);
    } catch {
      await fs.writeFile(CLIPBOARD_HISTORY_FILE, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.error('Error ensuring clipboard history file:', error);
  }
}

async function loadHistory() {
  await ensureHistoryFile();
  const data = await fs.readFile(CLIPBOARD_HISTORY_FILE, 'utf8');
  return JSON.parse(data);
}

async function saveHistory(history) {
  await fs.writeFile(CLIPBOARD_HISTORY_FILE, JSON.stringify(history, null, 2));
}

export async function getCurrentClipboard() {
  try {
    const content = await clipboardy.read();
    
    return {
      content: [{
        type: "text",
        text: `📋 **Current Clipboard:**\n\n${content}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to read clipboard: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function setClipboard(text) {
  try {
    await clipboardy.write(text);
    
    // Save to history
    const history = await loadHistory();
    const entry = {
      content: text,
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    };
    
    history.unshift(entry);
    
    // Keep only recent entries
    if (history.length > MAX_HISTORY) {
      history.splice(MAX_HISTORY);
    }
    
    await saveHistory(history);
    
    return {
      content: [{
        type: "text",
        text: `✅ Clipboard updated!\n\nContent: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to set clipboard: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getClipboardHistory(limit = 10) {
  try {
    const history = await loadHistory();
    
    if (history.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📋 Clipboard history is empty`
        }]
      };
    }

    let output = `📋 **Clipboard History (${Math.min(limit, history.length)} items)**\n\n`;
    
    history.slice(0, limit).forEach((entry, i) => {
      const time = new Date(entry.timestamp).toLocaleString();
      const preview = entry.content.length > 60 
        ? entry.content.substring(0, 60) + '...' 
        : entry.content;
      
      output += `${i + 1}. [${time}]\n`;
      output += `   ${preview}\n`;
      output += `   ID: ${entry.id}\n\n`;
    });

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to get clipboard history: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function searchClipboardHistory(searchTerm) {
  try {
    const history = await loadHistory();
    const results = history.filter(entry => 
      entry.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📋 No clipboard entries found matching: "${searchTerm}"`
        }]
      };
    }

    let output = `📋 **Found ${results.length} matches for "${searchTerm}"**\n\n`;
    
    results.slice(0, 10).forEach((entry, i) => {
      const time = new Date(entry.timestamp).toLocaleString();
      const preview = entry.content.length > 100 
        ? entry.content.substring(0, 100) + '...' 
        : entry.content;
      
      output += `${i + 1}. [${time}]\n`;
      output += `   ${preview}\n`;
      output += `   ID: ${entry.id}\n\n`;
    });

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to search clipboard: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function restoreFromHistory(entryId) {
  try {
    const history = await loadHistory();
    const entry = history.find(e => e.id === entryId);

    if (!entry) {
      return {
        content: [{
          type: "text",
          text: `❌ Clipboard entry not found with ID: ${entryId}`
        }],
        isError: true
      };
    }

    await clipboardy.write(entry.content);

    return {
      content: [{
        type: "text",
        text: `✅ Restored to clipboard!\n\n${entry.content.substring(0, 200)}${entry.content.length > 200 ? '...' : ''}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to restore from history: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function clearClipboardHistory() {
  try {
    await saveHistory([]);
    
    return {
      content: [{
        type: "text",
        text: `✅ Clipboard history cleared!`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to clear history: ${error.message}`
      }],
      isError: true
    };
  }
}
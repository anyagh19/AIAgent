import { exec } from "child_process";
import { promisify } from "util";
import { mouse, keyboard, screen, Button, Key, Point } from "@nut-tree-fork/nut-js";
import screenshot from "screenshot-desktop";
import Anthropic from "@anthropic-ai/sdk";

const execAsync = promisify(exec);

// Configure nut-js for smoother, faster movement
mouse.config.mouseSpeed = 1500;
keyboard.config.autoDelayMs = 50;

// ─────────────────────────────────────────────
// SCREEN CAPTURE
// ─────────────────────────────────────────────

async function captureScreen() {
  try {
    const img = await screenshot({ format: "png" });
    return img.toString("base64");
  } catch (error) {
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// CLAUDE VISION — ANALYZE SCREEN
// ─────────────────────────────────────────────

async function analyzeScreenWithVision(base64Image, userIntent) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: `Analyze this screenshot. User wants to: "${userIntent}"

Please provide:
1. What applications/windows are currently visible
2. Exact location of relevant UI elements — use pixel coordinates if possible, otherwise describe as "top-left", "center", "bottom-right", etc.
3. Step-by-step actions to fulfill the user's intent
4. Any relevant visible text

Be as specific as possible about element locations on screen.`,
          },
        ],
      },
    ],
  });

  return message.content[0].text;
}

// ─────────────────────────────────────────────
// MOUSE ACTIONS
// ─────────────────────────────────────────────

async function clickAt(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    await mouse.click(Button.LEFT);
    return { success: true, action: `Clicked at (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function doubleClickAt(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    await mouse.doubleClick(Button.LEFT);
    return { success: true, action: `Double-clicked at (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function rightClickAt(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    await mouse.click(Button.RIGHT);
    return { success: true, action: `Right-clicked at (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function moveMouse(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    return { success: true, action: `Moved mouse to (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function scrollScreen(direction, amount = 3) {
  try {
    if (direction === "down") {
      await mouse.scrollDown(amount);
    } else {
      await mouse.scrollUp(amount);
    }
    return { success: true, action: `Scrolled ${direction} by ${amount}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// KEYBOARD ACTIONS
// ─────────────────────────────────────────────

async function typeText(text) {
  try {
    await keyboard.type(text);
    return { success: true, action: `Typed: "${text}"` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Map common key name strings → nut-js Key enum values
function resolveKey(keyName) {
  const map = {
    enter: Key.Return, return: Key.Return,
    escape: Key.Escape, esc: Key.Escape,
    tab: Key.Tab,
    backspace: Key.Backspace,
    delete: Key.Delete,
    space: Key.Space,
    up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
    home: Key.Home, end: Key.End,
    pageup: Key.PageUp, pagedown: Key.PageDown,
    f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4,
    f5: Key.F5, f6: Key.F6, f7: Key.F7, f8: Key.F8,
    f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
    a: Key.A, b: Key.B, c: Key.C, d: Key.D, e: Key.E,
    f: Key.F, g: Key.G, h: Key.H, i: Key.I, j: Key.J,
    k: Key.K, l: Key.L, m: Key.M, n: Key.N, o: Key.O,
    p: Key.P, q: Key.Q, r: Key.R, s: Key.S, t: Key.T,
    u: Key.U, v: Key.V, w: Key.W, x: Key.X, y: Key.Y, z: Key.Z,
  };
  const resolved = map[keyName.toLowerCase()];
  if (!resolved) throw new Error(`Unknown key: "${keyName}". Use: enter, escape, tab, a-z, f1-f12, up/down/left/right, etc.`);
  return resolved;
}

function resolveModifier(mod) {
  const map = {
    control: Key.LeftControl, ctrl: Key.LeftControl,
    alt: Key.LeftAlt, option: Key.LeftAlt,
    shift: Key.LeftShift,
    command: Key.LeftSuper, meta: Key.LeftSuper, win: Key.LeftSuper,
  };
  const resolved = map[mod.toLowerCase()];
  if (!resolved) throw new Error(`Unknown modifier: "${mod}". Use: control, alt, shift, command`);
  return resolved;
}

async function pressKey(keyName, modifiers = []) {
  try {
    const key = resolveKey(keyName);
    const mods = modifiers.map(resolveModifier);
    if (mods.length > 0) {
      await keyboard.pressKey(...mods, key);
      await keyboard.releaseKey(...mods, key);
    } else {
      await keyboard.pressKey(key);
      await keyboard.releaseKey(key);
    }
    const label = [...modifiers, keyName].join("+");
    return { success: true, action: `Pressed: ${label}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// APPLICATION LAUNCHER
// ─────────────────────────────────────────────

async function openApplication(appName) {
  try {
    const platform = process.platform;
    let command;
    switch (platform) {
      case "win32":
        command = `start "" "${appName}"`;
        break;
      case "darwin":
        command = `open -a "${appName}"`;
        break;
      case "linux":
        command = `${appName.toLowerCase()} &`;
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    await execAsync(command);
    return { success: true, action: `Opened "${appName}"` };
  } catch (error) {
    try {
      await execAsync(appName);
      return { success: true, action: `Opened "${appName}" (fallback)` };
    } catch {
      return { success: false, error: error.message };
    }
  }
}

// ─────────────────────────────────────────────
// SCREEN SIZE
// ─────────────────────────────────────────────

async function getScreenSize() {
  try {
    const width = await screen.width();
    const height = await screen.height();
    return { success: true, width, height };
  } catch {
    return { success: true, width: 1920, height: 1080 };
  }
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

export async function computerControl(action, params = {}) {
  try {
    switch (action) {

      case "screenshot": {
        const screenData = await captureScreen();
        return {
          success: true,
          content: [
            { type: "text", text: "📸 Screenshot captured successfully." },
            { type: "image", data: screenData, mimeType: "image/png" },
          ],
        };
      }

      case "analyze": {
        const base64Image = await captureScreen();
        const analysis = await analyzeScreenWithVision(
          base64Image,
          params.intent || "analyze the current screen"
        );
        return {
          success: true,
          content: [{ type: "text", text: `🔍 Screen Analysis:\n\n${analysis}` }],
        };
      }

      case "click": {
        const result = await clickAt(params.x, params.y);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "double_click": {
        const result = await doubleClickAt(params.x, params.y);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "right_click": {
        const result = await rightClickAt(params.x, params.y);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "type": {
        const result = await typeText(params.text);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "press_key": {
        const result = await pressKey(params.key, params.modifiers || []);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "open_app": {
        const result = await openApplication(params.app);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "move_mouse": {
        const result = await moveMouse(params.x, params.y);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "scroll": {
        const result = await scrollScreen(params.direction, params.amount);
        return {
          success: result.success,
          content: [{ type: "text", text: result.success ? `✅ ${result.action}` : `❌ ${result.error}` }],
        };
      }

      case "get_screen_size": {
        const result = await getScreenSize();
        return {
          success: true,
          content: [{ type: "text", text: `🖥️ Screen size: ${result.width}x${result.height}` }],
        };
      }

      default:
        return {
          success: false,
          content: [{
            type: "text",
            text: `❌ Unknown action: "${action}". Available: screenshot, analyze, click, double_click, right_click, type, press_key, open_app, move_mouse, scroll, get_screen_size`,
          }],
        };
    }
  } catch (error) {
    return {
      success: false,
      content: [{ type: "text", text: `❌ Computer control error: ${error.message}` }],
    };
  }
}
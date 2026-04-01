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
// APP NAME MAPPINGS (FLEXIBLE RECOGNITION)
// ─────────────────────────────────────────────

const APP_MAPPINGS = {
  win32: {
    whatsapp: ["WhatsApp", "whatsapp://"],
    fileexplorer: ["explorer.exe"],
    explorer: ["explorer.exe"],
    notepad: ["notepad.exe"],
    calculator: ["calc.exe"],
    chrome: ["chrome.exe", "Google Chrome"],
    firefox: ["firefox.exe"],
    edge: ["msedge.exe", "Microsoft Edge"],
    vscode: ["code.exe", "Visual Studio Code"],
    spotify: ["spotify.exe", "Spotify"],
    discord: ["discord.exe", "Discord"],
    slack: ["slack.exe", "Slack"],
    terminal: ["cmd.exe"],
    cmd: ["cmd.exe"],
    powershell: ["powershell.exe"],
  },
  darwin: {
    whatsapp: ["WhatsApp"],
    fileexplorer: ["Finder"],
    explorer: ["Finder"],
    finder: ["Finder"],
    safari: ["Safari"],
    chrome: ["Google Chrome"],
    firefox: ["Firefox"],
    vscode: ["Visual Studio Code"],
    terminal: ["Terminal"],
    spotify: ["Spotify"],
    notes: ["Notes"],
    calculator: ["Calculator"],
  },
  linux: {
    whatsapp: ["whatsapp-desktop", "whatsapp-nativefier"],
    fileexplorer: ["nautilus", "dolphin", "thunar", "pcmanfm"],
    explorer: ["nautilus", "dolphin", "thunar"],
    terminal: ["gnome-terminal", "konsole", "xterm"],
    chrome: ["google-chrome", "chromium"],
    firefox: ["firefox"],
    vscode: ["code"],
  },
};

function resolveAppName(appName) {
  const platform = process.platform;
  const normalized = appName.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  const mapping = APP_MAPPINGS[platform];
  if (!mapping) return [appName];
  
  return mapping[normalized] || [appName];
}

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
// CLAUDE AGENT — PLAN AND EXECUTE TASKS
// ─────────────────────────────────────────────

async function executeTaskWithAgent(userIntent, maxIterations = 10) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const conversationHistory = [];
  const executionLog = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Capture current screen
    const base64Image = await captureScreen();
    
    // Build the prompt for Claude
    const systemPrompt = `You are a computer control agent. You can see the user's screen and execute actions to fulfill their requests.

Available actions (respond with valid JSON only):
1. {"action": "click", "x": 100, "y": 200}
2. {"action": "double_click", "x": 100, "y": 200}
3. {"action": "right_click", "x": 100, "y": 200}
4. {"action": "type", "text": "hello world"}
5. {"action": "press_key", "key": "enter", "modifiers": ["control"]}
   - Keys: enter, escape, tab, backspace, delete, space, up, down, left, right, a-z, f1-f12
   - Modifiers: control, alt, shift, command
6. {"action": "scroll", "direction": "down", "amount": 3}
7. {"action": "wait", "seconds": 2}
8. {"action": "open_app", "app": "chrome"}
9. {"action": "done", "message": "Task completed successfully"}

CRITICAL RULES:
- Respond with ONLY a JSON object, no other text
- Include "reasoning" field explaining your decision
- Use pixel coordinates from the screenshot
- Wait after opening apps or clicking buttons (use "wait" action)
- When task is complete, use {"action": "done"}
- If stuck after 3 similar actions, try a different approach`;

    const userMessage = iteration === 0
      ? `User request: "${userIntent}"\n\nAnalyze the screen and determine the first action needed.`
      : `Previous action was executed. Analyze the new screen state and determine the next action.`;

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
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
                text: userMessage,
              },
            ],
          },
        ],
      });

      const responseText = message.content[0].text.trim();
      
      // Parse the JSON response
      let actionPlan;
      try {
        // Remove markdown code blocks if present
        const cleaned = responseText.replace(/```json\n?|```\n?/g, "").trim();
        actionPlan = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("Failed to parse Claude response:", responseText);
        executionLog.push({
          iteration,
          error: "Failed to parse agent response",
          response: responseText,
        });
        break;
      }

      executionLog.push({
        iteration,
        reasoning: actionPlan.reasoning,
        action: actionPlan.action,
        params: actionPlan,
      });

      console.log(`\n[Step ${iteration + 1}] ${actionPlan.reasoning}`);
      console.log(`Action:`, actionPlan);

      // Add to conversation history
      conversationHistory.push({
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64Image },
          },
          { type: "text", text: userMessage },
        ],
      });
      conversationHistory.push({
        role: "assistant",
        content: responseText,
      });

      // Execute the action
      if (actionPlan.action === "done") {
        return {
          success: true,
          message: actionPlan.message || "Task completed",
          log: executionLog,
        };
      }

      const result = await executeAction(actionPlan);
      
      if (!result.success) {
        executionLog.push({ iteration, error: result.error });
        console.error(`❌ Action failed:`, result.error);
        // Continue anyway - Claude might adapt
      }

      // Small delay between actions
      await new Promise((resolve) => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`Error in iteration ${iteration}:`, error);
      executionLog.push({ iteration, error: error.message });
      break;
    }
  }

  return {
    success: false,
    message: "Max iterations reached or error occurred",
    log: executionLog,
  };
}

// ─────────────────────────────────────────────
// EXECUTE A SINGLE ACTION
// ─────────────────────────────────────────────

async function executeAction(actionPlan) {
  const { action } = actionPlan;

  switch (action) {
    case "click":
      return await clickAt(actionPlan.x, actionPlan.y);
    
    case "double_click":
      return await doubleClickAt(actionPlan.x, actionPlan.y);
    
    case "right_click":
      return await rightClickAt(actionPlan.x, actionPlan.y);
    
    case "type":
      return await typeText(actionPlan.text);
    
    case "press_key":
      return await pressKey(actionPlan.key, actionPlan.modifiers || []);
    
    case "scroll":
      return await scrollScreen(actionPlan.direction, actionPlan.amount || 3);
    
    case "wait":
      await new Promise((resolve) => setTimeout(resolve, (actionPlan.seconds || 1) * 1000));
      return { success: true, action: `Waited ${actionPlan.seconds || 1}s` };
    
    case "open_app":
      return await openApplication(actionPlan.app);
    
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ─────────────────────────────────────────────
// VISION ANALYSIS (NON-AGENTIC)
// ─────────────────────────────────────────────

async function analyzeScreenWithVision(base64Image, userIntent) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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

Provide:
1. What applications/windows are currently visible
2. Exact pixel coordinates of relevant UI elements
3. Step-by-step actions needed
4. Any relevant visible text

Be specific about element locations.`,
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
    await new Promise((resolve) => setTimeout(resolve, 100));
    await mouse.click(Button.LEFT);
    return { success: true, action: `Clicked at (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function doubleClickAt(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await mouse.doubleClick(Button.LEFT);
    return { success: true, action: `Double-clicked at (${x}, ${y})` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function rightClickAt(x, y) {
  try {
    await mouse.setPosition(new Point(x, y));
    await new Promise((resolve) => setTimeout(resolve, 100));
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
  if (!resolved) throw new Error(`Unknown key: "${keyName}"`);
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
  if (!resolved) throw new Error(`Unknown modifier: "${mod}"`);
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
// APPLICATION LAUNCHER (IMPROVED)
// ─────────────────────────────────────────────

async function openApplication(appName) {
  const platform = process.platform;
  const appVariants = resolveAppName(appName);

  for (const variant of appVariants) {
    try {
      let command;
      
      switch (platform) {
        case "win32":
          // Try as protocol first (for WhatsApp, etc.)
          if (variant.includes("://")) {
            command = `start "" "${variant}"`;
          } else {
            command = `start "" "${variant}"`;
          }
          break;
          
        case "darwin":
          command = `open -a "${variant}"`;
          break;
          
        case "linux":
          command = `${variant} &`;
          break;
          
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      await execAsync(command);
      console.log(`✅ Opened "${variant}"`);
      
      // Wait for app to launch
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      return { success: true, action: `Opened "${variant}"` };
    } catch (error) {
      console.log(`⚠️  Failed to open "${variant}": ${error.message}`);
      // Try next variant
      continue;
    }
  }

  // All variants failed
  return {
    success: false,
    error: `Could not open "${appName}". Tried: ${appVariants.join(", ")}`,
  };
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

      // ═══════════════════════════════════════
      // NEW: AGENTIC TASK EXECUTION
      // ═══════════════════════════════════════
      case "execute_task": {
        console.log(`\n🤖 Starting agentic task execution...`);
        console.log(`📋 User intent: "${params.intent}"\n`);
        
        const result = await executeTaskWithAgent(
          params.intent,
          params.maxIterations || 10
        );
        
        const logSummary = result.log
          .map((entry, i) => `Step ${i + 1}: ${entry.reasoning || entry.error}`)
          .join("\n");
        
        return {
          success: result.success,
          content: [
            {
              type: "text",
              text: result.success
                ? `✅ ${result.message}\n\nExecution log:\n${logSummary}`
                : `❌ ${result.message}\n\nExecution log:\n${logSummary}`,
            },
          ],
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
            text: `❌ Unknown action: "${action}". Available: screenshot, analyze, execute_task, click, double_click, right_click, type, press_key, open_app, move_mouse, scroll, get_screen_size`,
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
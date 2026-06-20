import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import session from "express-session";

mongoose.connect("mongodb+srv://Aniket:Aniket123@cluster0.3nwumy2.mongodb.net/mcpauth")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import z from "zod";
import { createPost, getTweets } from "./mcp.tool.js";
import { apiResponse } from "./mail.tool.js";
import { analyzeScreenshot } from "./screenshot.tool.js";
import { browserSearch } from "./browser.tool.js";
import { computerControl } from "./computer.tool.js";
// import { sendWhatsAppMessage, sendWhatsAppFile } from "./whatsapp.tool.js";
import { listFiles, readFile, writeFile } from './file.tool.js';
import { wikipediaLookup } from './wikipedia.tool.js';
import { getSystemInfo } from './system.tool.js';
import { shortenUrl } from './shorten.tool.js';
import { launchApp } from './app_launcher.tool.js';
import { openFolder, openDownloads, openDocuments, openDesktop } from './file_explorer.tool.js';
import { openFile, searchAndOpenFile } from './fileopener.tool.js';
// import { sendWhatsAppMessage, sendTelegramMessage } from './send_message_app.tool.js';
import { listDownloads, openLatestDownload, openDownloadedPDF } from './downloads_manager.tool.js';
import User from './models/user.js';
// import openInstagram from "./instagram.tool.js";
// Expense Tools
import {
  logExpense,
  getSpendingSummary,
  listExpenses,
  deleteExpense,
  getExpenseStats,
  exportExpenses
} from "./expense.tool.js";

// Clipboard Tools
import {
  getCurrentClipboard,
  setClipboard,
  getClipboardHistory,
  searchClipboardHistory,
  restoreFromHistory,
  clearClipboardHistory
} from "./clipboard.tool.js";

// Gmail Tools
import {
  searchEmails,
  getUnreadEmails,
  getEmailContent,
  markAsRead,
  sendEmail,
  getEmailStats
} from "./email.tool.js";

// Task Tools
import {
  addTask,
  listTasks,
  completeTask,
  deleteTask,
  updateTask,
  getTaskStats
} from "./task.tool.js";

// Calendar Tools
import {
  getUpcomingEvents,
  createEvent,
  findFreeSlots,
  deleteEvent
} from "./calendar.tool.js";

const app = express();
app.use(express.json());

const SECRET = "mysecretkey";

// Session configuration
app.use(session({
  secret: "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Auth middleware for MCP endpoint
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Map to store transports by session ID
const transports = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', authMiddleware, async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        console.log(`[app.js] Session closed and transport removed: ${transport.sessionId}`);
      }
    };

    // ... set up server resources, tools, and prompts ...
    const server = new McpServer({
      name: "example-server",
      version: "1.0.0"
    });

    server.tool(
      "addTwoNumbers",
      "Add two numbers",
      {
        a: z.number(),
        b: z.number()
      },
      async (input) => {
        const { a, b } = input;
        return {
          content: [
            {
              type: "text",
              text: `The sum of ${a} and ${b} is ${a + b}.`
            }
          ]
        };
      }
    );

    server.tool(
      "createPost",
      "Create a Twitter post",
      {
        status: z.string()
      },
      async (input) => {
        const { status } = input;
        return createPost(status);
      }
    )

    server.tool(
      "getTweets",
      "Get the most recent tweets from the authenticated user's timeline.",
      {},
      async () => {
        return getTweets();
      }
    )

    server.tool(
      "mailer",
      "Send an email with the given status",
      {
        from1_: z.string(),
        to: z.string(),
        sub: z.string()
      },
      async (input) => {
        const { from1_, to, sub } = input;
        const response = await apiResponse({ from: from1_, to, sub });

        console.log("Email API response:", JSON.stringify(response, null, 2));

        if (response.error || !response.content?.[0]?.text) {
          return {
            content: [
              {
                type: "text",
                text: response.message || "Unknown error from mailer tool",
              }
            ],
            isError: true
          };
        }

        return {
          content: [
            {
              type: "text",
              text: response.content[0].text
            }
          ]
        };
      }
    );

    server.tool(
      "analyzeScreenshot",
      "Take a screenshot of the desktop and generate a natural language analysis report",
      {},
      async () => {
        const result = await analyzeScreenshot();

        if (!result.success) {
          return {
            content: [
              { type: "text", text: `❌ Failed to analyze screenshot: ${result.error}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `📸 Screenshot analysis report:\n${result.report}`,
            },
          ],
        };
      }
    );

    server.tool(
      "navigateAndSearch",
      "Navigate to a website and perform a search. Opens a new browser tab with the search results.",
      {
        website: z
          .string()
          .describe("Website name like amazon, flipkart, google, youtube"),
        query: z.string().describe("Search query"),
      },
      async ({ website, query }) => {
        const sites = {
          amazon: (q) =>
            `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
          flipkart: (q) =>
            `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
          google: (q) =>
            `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          youtube: (q) =>
            `https://www.youtube.com/results?search_query=${encodeURIComponent(
              q
            )}`,
        };

        const key = website.toLowerCase();

        if (!sites[key]) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Website "${website}" not supported. Available websites: amazon, flipkart, google, youtube`,
              },
            ],
            isError: true,
          };
        }

        const finalUrl = sites[key](query);

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully opened ${website} and searching for "${query}". The tab should open in your browser now.`,
            },
          ],
          metadata: {
            action: "open_tab",
            url: finalUrl,
          },
        };
      }
    );

    server.tool(
      "computerControl",
      "Control the computer to fulfill user commands. Use this to click, type, open apps, take screenshots, and interact with the desktop. This is your primary tool for tasks like 'open WhatsApp', 'search email', 'click on button', etc.",
      {
        action: z.enum([
          "screenshot",
          "analyze",
          "click",
          "type",
          "press_key",
          "open_app",
          "get_screen_size",
          "move_mouse",
          "scroll",
          "double_click",
          "right_click"
        ]).describe("Action to perform on the computer"),
        params: z.object({
          x: z.number().optional().describe("X coordinate for click/move actions"),
          y: z.number().optional().describe("Y coordinate for click/move actions"),
          text: z.string().optional().describe("Text to type on keyboard"),
          key: z.string().optional().describe("Key to press (enter, escape, tab, backspace, space, etc.)"),
          modifiers: z.array(z.string()).optional().describe("Key modifiers like ['control'], ['alt'], ['shift'], ['command']"),
          app: z.string().optional().describe("Application name to open (e.g., 'WhatsApp', 'chrome', 'notepad')"),
          intent: z.string().optional().describe("What you're trying to find or do - used for vision analysis"),
          direction: z.enum(["up", "down"]).optional().describe("Scroll direction"),
          amount: z.number().optional().describe("Scroll amount (default: 3)")
        }).optional().describe("Parameters for the action")
      },
      async ({ action, params = {} }) => {
        try {
          const result = await computerControl(action, params);

          if (!result.success) {
            return {
              content: result.content,
              isError: true,
            };
          }

          return {
            content: result.content,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Computer control error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );

    server.tool(
      "whatsappControl",
      "Control WhatsApp to open the app, navigate to specific contacts, send messages, or share files from Downloads folder. Use this for tasks like 'open WhatsApp', 'message John', 'send file to Sarah', etc.",
      {
        action: z.enum([
          "open",
          "open_chat",
          "send_message",
          "send_file"
        ]).describe("Action to perform: open (just open WhatsApp), open_chat (open specific contact), send_message (send text message), send_file (send file from Downloads)"),
        params: z.object({
          contactName: z.string().optional().describe("Name of the contact (required for open_chat, send_message, send_file)"),
          message: z.string().optional().describe("Message text to send (required for send_message)"),
          fileName: z.string().optional().describe("Name of file in Downloads folder to send (required for send_file)")
        }).optional().describe("Parameters for the WhatsApp action")
      },
      async ({ action, params = {} }) => {
        try {
          const result = await whatsappControl(action, params);

          if (!result.success) {
            return {
              content: result.content,
              isError: true,
            };
          }

          return {
            content: result.content,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ WhatsApp control error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );

    server.tool(
      "openInstagram",
      "Open Instagram application or website on the default browser.",
      {},
      async () => {
        const result = await openInstagram();
        return result;
      }
    )

    server.tool(
      "list_files",
      "List all files in a directory",
      { directory: z.string().optional().describe("Directory path (relative to base)") },
      async ({ directory = "" }) => listFiles(directory)
    );

    server.tool(
      "read_file",
      "Read contents of a text file",
      { path: z.string().describe("File path (relative to base)") },
      async ({ path }) => readFile(path)
    );

    server.tool(
      "write_file",
      "Write or overwrite a text file",
      { path: z.string().describe("File path"), content: z.string().describe("Text content") },
      async ({ path, content }) => writeFile(path, content)
    );

    server.tool(
      "wikipedia",
      "Get a summary from Wikipedia",
      { term: z.string().describe("Search term") },
      async ({ term }) => wikipediaLookup(term)
    );

    server.tool(
      "system_info",
      "Get detailed system information (OS, CPU, memory, uptime)",
      {},
      async () => getSystemInfo()
    );

    // shorten.tool.js
    server.tool(
      "shorten_url",
      "Shorten a long URL using TinyURL",
      { url: z.string().describe("Long URL to shorten") },
      async ({ url }) => shortenUrl(url)
    );

    // App Launcher
    server.tool("launch_app", "Launch any installed application by name (e.g., notepad, chrome, whatsapp)",
      { app_name: z.string().describe("Application name (e.g., notepad, chrome, whatsapp, spotify)") },
      async ({ app_name }) => launchApp(app_name)
    );

    // File Explorer
    server.tool("open_folder", "Open a folder in Windows Explorer",
      { folder_path: z.string().describe("Full path to folder"), select_file: z.string().optional() },
      async ({ folder_path, select_file = null }) => openFolder(folder_path, select_file)
    );

    server.tool("open_downloads", "Open the Downloads folder (optionally select a file)",
      { subfolder: z.string().optional(), select_file: z.string().optional() },
      async ({ subfolder = "", select_file = null }) => openDownloads(subfolder, select_file)
    );

    server.tool("open_documents", "Open the Documents folder",
      { subfolder: z.string().optional() },
      async ({ subfolder = "" }) => openDocuments(subfolder)
    );

    server.tool("open_desktop", "Open the Desktop folder",
      { subfolder: z.string().optional() },
      async ({ subfolder = "" }) => openDesktop(subfolder)
    );

    // File Operations
    server.tool("open_file", "Open any file with its default application",
      { file_path: z.string().describe("Full path to file") },
      async ({ file_path }) => openFile(file_path)
    );

    server.tool("search_and_open_file", "Search for a file by name and open it (searches user folder)",
      { file_name: z.string().describe("Part of the file name"), base_dir: z.string().optional() },
      async ({ file_name, base_dir = process.env.USERPROFILE }) => searchAndOpenFile(file_name, base_dir)
    );

    // Messaging Apps
    // server.tool("send_whatsapp_message", "Open WhatsApp with a pre-filled message (user must press send)",
    //   { phone_number: z.string().describe("Phone number with country code (e.g., 919876543210) or leave empty for contact search"), message: z.string() },
    //   async ({ phone_number, message }) => sendWhatsAppMessage(phone_number, message)
    // );

    // server.tool("send_telegram_message", "Open Telegram with a pre-filled message",
    //   { chat_id: z.string().describe("Telegram username or chat ID"), message: z.string() },
    //   async ({ chat_id, message }) => sendTelegramMessage(chat_id, message)
    // );

    // Downloads Manager
    server.tool("list_downloads", "List files in Downloads folder (optionally filter by name)",
      { filter: z.string().optional().describe("Filter text") },
      async ({ filter = "" }) => listDownloads(filter)
    );

    server.tool("open_latest_download", "Open the most recently downloaded file",
      {},
      async () => openLatestDownload()
    );

    server.tool("open_downloaded_pdf", "Open a PDF file from Downloads by name (partial match)",
      { file_part: z.string().describe("Part of the PDF filename") },
      async ({ file_part }) => openDownloadedPDF(file_part)
    );

    // Inside server.tool block
    server.tool(
      "whatsapp_send_message",
      "Send a text message via WhatsApp Desktop. Provide contact name exactly as saved.",
      {
        contact: z.string().describe("Contact name (as shown in WhatsApp)"),
        message: z.string().describe("Message text to send")
      },
      async ({ contact, message }) => sendWhatsAppMessage(contact, message)
    );

    server.tool(
      "whatsapp_send_file",
      "Send a file via WhatsApp Desktop. Provide contact name and full file path.",
      {
        contact: z.string().describe("Contact name (as shown in WhatsApp)"),
        file_path: z.string().describe("Absolute path to the file (e.g., C:\\Users\\name\\Downloads\\doc.pdf)")
      },
      async ({ contact, file_path }) => sendWhatsAppFile(contact, file_path)
    );

    server.tool(
      "log_expense",
      "Log a new expense",
      {
        amount: z.number(),
        category: z.string(),
        description: z.string().optional(),
        date: z.string().optional()
      },
      async ({ amount, category, description = "", date = null }) =>
        logExpense(amount, category, description, date)
    );

    server.tool(
      "spending_summary",
      "Get spending summary",
      {
        period: z.enum(["week", "month", "year"]).optional(),
        year: z.number().optional(),
        month: z.number().optional()
      },
      async ({ period = "month", year, month }) =>
        getSpendingSummary(period, year, month)
    );

    server.tool(
      "list_expenses",
      "List recent expenses",
      {
        limit: z.number().optional(),
        category: z.string().optional()
      },
      async ({ limit = 20, category = null }) =>
        listExpenses(limit, category)
    );

    server.tool(
      "delete_expense",
      "Delete expense by ID",
      {
        expenseId: z.string()
      },
      async ({ expenseId }) => deleteExpense(expenseId)
    );

    server.tool(
      "expense_stats",
      "Get expense statistics",
      {},
      async () => getExpenseStats()
    );

    server.tool(
      "export_expenses",
      "Export expenses to CSV or JSON",
      {
        format: z.enum(["csv", "json"]).optional()
      },
      async ({ format = "csv" }) => exportExpenses(format)
    );

    server.tool(
      "get_clipboard",
      "Get current clipboard content",
      {},
      async () => getCurrentClipboard()
    );

    server.tool(
      "set_clipboard",
      "Set clipboard content",
      {
        text: z.string()
      },
      async ({ text }) => setClipboard(text)
    );

    server.tool(
      "clipboard_history",
      "Get clipboard history",
      {
        limit: z.number().optional()
      },
      async ({ limit = 10 }) => getClipboardHistory(limit)
    );

    server.tool(
      "search_clipboard",
      "Search clipboard history",
      {
        searchTerm: z.string()
      },
      async ({ searchTerm }) => searchClipboardHistory(searchTerm)
    );

    server.tool(
      "restore_clipboard",
      "Restore clipboard item from history",
      {
        entryId: z.string()
      },
      async ({ entryId }) => restoreFromHistory(entryId)
    );

    server.tool(
      "clear_clipboard_history",
      "Clear clipboard history",
      {},
      async () => clearClipboardHistory()
    );

    server.tool(
      "search_emails",
      "Search Gmail emails",
      {
        query: z.string(),
        maxResults: z.number().optional()
      },
      async ({ query, maxResults = 10 }) =>
        searchEmails(query, maxResults)
    );

    server.tool(
      "unread_emails",
      "Get unread emails",
      {
        maxResults: z.number().optional()
      },
      async ({ maxResults = 10 }) =>
        getUnreadEmails(maxResults)
    );

    server.tool(
      "get_email_content",
      "Get full email content",
      {
        emailId: z.string()
      },
      async ({ emailId }) => getEmailContent(emailId)
    );

    server.tool(
      "mark_email_read",
      "Mark email as read",
      {
        emailId: z.string()
      },
      async ({ emailId }) => markAsRead(emailId)
    );

    server.tool(
      "send_email",
      "Send Gmail email",
      {
        to: z.string(),
        subject: z.string(),
        body: z.string()
      },
      async ({ to, subject, body }) =>
        sendEmail(to, subject, body)
    );

    server.tool(
      "email_stats",
      "Get Gmail statistics",
      {},
      async () => getEmailStats()
    );


    server.tool(
      "add_task",
      "Add a new task",
      {
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        dueDate: z.string().optional(),
        tags: z.array(z.string()).optional()
      },
      async ({
        title,
        description = "",
        priority = "medium",
        dueDate = null,
        tags = []
      }) =>
        addTask(title, description, priority, dueDate, tags)
    );

    server.tool(
      "list_tasks",
      "List tasks",
      {
        filter: z.enum(["all", "pending", "completed", "high", "overdue"]).optional(),
        sortBy: z.enum(["createdAt", "priority", "dueDate"]).optional()
      },
      async ({ filter = "all", sortBy = "createdAt" }) =>
        listTasks(filter, sortBy)
    );

    server.tool(
      "complete_task",
      "Mark task as completed",
      {
        taskId: z.string()
      },
      async ({ taskId }) => completeTask(taskId)
    );

    server.tool(
      "delete_task",
      "Delete task",
      {
        taskId: z.string()
      },
      async ({ taskId }) => deleteTask(taskId)
    );

    server.tool(
      "update_task",
      "Update task",
      {
        taskId: z.string(),
        updates: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high"]).optional(),
          dueDate: z.string().optional(),
          tags: z.array(z.string()).optional()
        })
      },
      async ({ taskId, updates }) =>
        updateTask(taskId, updates)
    );

    server.tool(
      "task_stats",
      "Get task statistics",
      {},
      async () => getTaskStats()
    );

    server.tool(
      "upcoming_events",
      "Get upcoming calendar events",
      {
        maxResults: z.number().optional(),
        timeMin: z.string().optional(),
        timeMax: z.string().optional()
      },
      async ({ maxResults = 10, timeMin = null, timeMax = null }) =>
        getUpcomingEvents(maxResults, timeMin, timeMax)
    );

    server.tool(
      "create_event",
      "Create calendar event",
      {
        summary: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        description: z.string().optional(),
        location: z.string().optional()
      },
      async ({
        summary,
        startTime,
        endTime,
        description = "",
        location = ""
      }) =>
        createEvent(summary, startTime, endTime, description, location)
    );

    server.tool(
      "find_free_slots",
      "Find free calendar slots",
      {
        date: z.string(),
        duration: z.number().optional()
      },
      async ({ date, duration = 60 }) =>
        findFreeSlots(date, duration)
    );

    server.tool(
      "delete_event",
      "Delete calendar event",
      {
        eventId: z.string()
      },
      async ({ eventId }) => deleteEvent(eventId)
    );

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', authMiddleware, handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', authMiddleware, handleSessionRequest);

// ============== AUTH ROUTES ==============

// Signup route
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword
    });

    await user.save();

    res.json({ message: "Signup successful" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login route
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, SECRET, {
      expiresIn: "24h"
    });

    res.json({ token, message: "Login successful" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
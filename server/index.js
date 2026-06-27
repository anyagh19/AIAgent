import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import session from "express-session";

mongoose.connect("mongodb+srv://Aniket:Anya19@cluster0.3nwumy2.mongodb.net/mcpauth")
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

import { listFiles, readFile, writeFile } from './file.tool.js';
import { wikipediaLookup } from './wikipedia.tool.js';
import { getSystemInfo } from './system.tool.js';
import { shortenUrl } from './shorten.tool.js';
import { launchApp } from './app_launcher.tool.js';
import { openFolder, openDownloads, openDocuments, openDesktop } from './file_explorer.tool.js';
import { openFile, searchAndOpenFile } from './fileopener.tool.js';

import { listDownloads, openLatestDownload, openDownloadedPDF } from './downloads_manager.tool.js';
import User from './models/user.js';

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
  searchEmailsBrowser,
  openLatestEmail,
  openEmailFrom,
  openEmailOnDate,
  openEmailContaining,
  openGmailSearch,
  sendEmailViaGmail,
  composeEmailBrowser,
  fetchUnreadEmails,
  triageInbox,
  startPeriodicTriage,
  stopPeriodicTriage,
  getLastTriageResults,
  openDraftInGmail,
  sendToastNotification,
  getUnreadCount
} from './email.tool.js';

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
  openCalendar,
  openCalendarOnDate,
  createEventBrowser,
  openCalendarMonth
} from './calendar.tool.js';

import { createPPT } from './ppt_generator.tool.js';

import {
  scrapePage,
  monitorChanges,
  extractStructuredData
} from './web_scrapper.tool.js';

import { sendMessage, sendFile } from './whatsapp.tool.js';

import {
  setBudget,
  getBudgetStatus,
  addBill,
  checkUpcomingBills,
  listAllBills,
  getFinancialHealth,
  forecastSpending,
  autoFinancialCheck
} from './finance_advisor.tool.js';

// Package tracker
import {
  addPackage,
  listPackages,
  checkAllPackages,
  removePackage,
  autoPackageCheck
} from './package_tracker.tool.js';

// Wellness coach
import {
  startWellnessSession,
  stopWellnessSession,
  takeBreak,
  setWellnessGoals,
  getTodayWellness,
  autoWellnessCheck,
  resetWellnessSession
} from './wellness_coach.tool.js';

import {
  addSubscription,
  listSubscriptions,
  checkRenewals,
  cancelSubscription,
  autoCheckRenewals
} from './subscription_manager.tool.js';

import {
  addJob,
  listJobs,
  updateJobStatus,
  checkFollowUps
} from './job_tracker.tool.js';

import {
  organizeFile,
  startDocumentWatcher,
  stopDocumentWatcher,
  organizeExistingFiles
} from './document_organizer.tool.js';

import { planDetailedTrip } from './travel_planner.tool.js';
import { generateAudioTour } from "./tour_planner.tool.js";
import { runGTMOutreach} from "./gtm_outreach.tool.js";

import { summarizeYouTubeVideo } from './youtube_summarizer.tool.js';

import cron from 'node-cron';


cron.schedule('0 9 * * *', async () => {
  console.log('Running daily financial check...');
  await autoFinancialCheck();
});

// Check packages every 2 hours
cron.schedule('0 */2 * * *', async () => {
  console.log('📦 Checking packages...');
  await autoPackageCheck();
});

// Wellness check every minute
cron.schedule('* * * * *', async () => {
  await autoWellnessCheck();
});

// Subscription renewals – daily at 8 AM
cron.schedule('0 8 * * *', async () => {
  console.log('🔄 Checking subscription renewals...');
  await autoCheckRenewals();
});

// Job follow‑ups – daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('💼 Checking job follow‑ups...');
  await checkFollowUps();
});


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

    //whatsapp
    server.tool(
      "send_whatsapp_message",
      {
        contact: z.string(),
        message: z.string()
      },
      async ({ contact, message }) =>
        sendMessage(contact, message)
    );

    server.tool(
      "send_whatsapp_file",
      {
        contact: z.string(),
        file: z.string()
      },
      async ({ contact, file }) =>
        sendFile(contact, file)
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

    // ─── Existing Email Tools ─────────────────────────────────────
    // ── Browser-only email tools ──
    server.tool(
      "search_emails",
      "Open Gmail in your browser with a custom search query",
      { query: z.string().describe("Gmail search query") },
      async ({ query }) => searchEmailsBrowser(query)
    );

    server.tool(
      "open_latest_email",
      "Open Gmail showing the most recent emails (inbox sorted by newest)",
      {},
      async () => openLatestEmail()
    );

    server.tool(
      "open_email_from",
      "Open Gmail showing emails from a specific sender",
      { sender: z.string().describe("Email address or name") },
      async ({ sender }) => openEmailFrom(sender)
    );

    server.tool(
      "open_email_on_date",
      "Open Gmail showing emails from a specific date",
      { date: z.string().describe("Date: 'today', 'yesterday', or 'YYYY-MM-DD'") },
      async ({ date }) => openEmailOnDate(date)
    );

    server.tool(
      "open_email_containing",
      "Open Gmail showing emails that contain a specific phrase",
      { text: z.string().describe("Text to search for in email body or subject") },
      async ({ text }) => openEmailContaining(text)
    );

    server.tool(
      "open_gmail_search",
      "Open Gmail with combined search criteria (sender, date, contains, custom query)",
      {
        query: z.string().optional(),
        sender: z.string().optional(),
        date: z.string().optional(),
        contains: z.string().optional()
      },
      async ({ query = '', sender = '', date = '', contains = '' }) =>
        openGmailSearch({ query, sender, date, contains })
    );

    // ─── Email (Gmail automation) ──────────────────────────────
    server.tool(
      "mailer",
      "Send an email automatically using Gmail (opens a new tab in your existing Edge window, fills compose, and clicks Send).",
      {
        to: z.string().describe("Recipient email address"),
        sub: z.string().describe("Subject of the email"),
        from1_: z.string().optional().describe("Sender name (ignored – kept for compatibility)")
      },
      async ({ to, sub, from1_ }) => {
        const body = `This is an automated email about: "${sub}"\n\nSent by your AI Assistant.`;
        const result = await sendEmailViaGmail(to, sub, body, false);
        return result;
      }
    ); server.tool(
      "compose_email",
      "Open Gmail compose with pre‑filled fields (manual send).",
      { to: z.string().optional(), subject: z.string().optional(), body: z.string().optional() },
      async ({ to = '', subject = '', body = '' }) => composeEmailBrowser(to, subject, body)
    );

    server.tool("triage_inbox", "AI‑summarise unread emails, draft replies, save results, toast notification.",
      { maxCount: z.number().optional() },
      async ({ maxCount = 5 }) => triageInbox(maxCount)
    );

    server.tool("start_periodic_triage", "Start auto‑triage every N minutes.",
      { intervalMinutes: z.number().optional(), maxCount: z.number().optional() },
      async ({ intervalMinutes = 30, maxCount = 5 }) => startPeriodicTriage(intervalMinutes, maxCount)
    );

    server.tool("stop_periodic_triage", "Stop auto‑triage.",
      {}, async () => stopPeriodicTriage()
    );

    server.tool("get_triage_results", "Get last triage results.",
      {}, async () => getLastTriageResults()
    );

    server.tool("open_draft_in_gmail", "Open AI draft in Gmail compose.",
      { index: z.number().optional() },
      async ({ index = 0 }) => openDraftInGmail(index)
    );

    server.tool("send_toast", "Send a Windows toast notification.",
      { title: z.string(), message: z.string(), openUrl: z.string().optional() },
      async ({ title, message, openUrl = 'https://mail.google.com/mail/u/0/#inbox' }) => {
        sendToastNotification(title, message, openUrl);
        return { content: [{ type: 'text', text: `🔔 Toast: "${title}"` }] };
      }
    );

    server.tool(
      "unread_count",
      "Check how many unread emails you have.",
      {},
      async () => getUnreadCount()
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

    // ─── Calendar Tools (Browser‑based) ──────────────────────
    server.tool(
      "open_calendar",
      "Open Google Calendar in your default browser",
      {},
      async () => openCalendar()
    );

    server.tool(
      "open_calendar_on_date",
      "Open Google Calendar on a specific date",
      {
        date: z.string().describe("Date: 'today', 'yesterday', or 'YYYY-MM-DD'")
      },
      async ({ date }) => openCalendarOnDate(date)
    );

    server.tool(
      "create_calendar_event",
      "Pre‑fill a new Google Calendar event and open it in your browser (you can adjust and save manually)",
      {
        summary: z.string().describe("Event title"),
        startTime: z.string().describe("Start time in ISO format, e.g., '2026-06-21T10:00:00'"),
        endTime: z.string().describe("End time in ISO format, e.g., '2026-06-21T11:00:00'"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location")
      },
      async ({ summary, startTime, endTime, description = '', location = '' }) =>
        createEventBrowser(summary, startTime, endTime, description, location)
    );

    server.tool(
      "open_calendar_month",
      "Open Google Calendar in month view for a given date",
      {
        date: z.string().describe("Date: 'today', 'yesterday', or 'YYYY-MM-DD'")
      },
      async ({ date }) => openCalendarMonth(date)
    );

    //ppt
    server.tool(
      "create_presentation",
      `Generate a PowerPoint presentation (.pptx) from a topic and structured content.

**When to use:**
- The user asks to create, generate, or make a PowerPoint, PPT, presentation, slides.
- The user provides a topic and some information (bullet points, paragraphs, sections).

**How it works:**
- The first line of each slide becomes the slide title.
- The remaining lines become bullet points.
- Separate slides with "---" (three dashes) on a new line.

**Example input:**
Topic: "AI Agent Overview"
Information:
"Introduction
- What is an AI Agent?
- Key characteristics
---
Applications
- Virtual assistants
- Autonomous systems
---
Future Trends
- Multimodal agents
- Ethical considerations"

**Output:** A .pptx file saved in user_files/ppts/ with the given filename.`,
      {
        topic: z.string().describe("Title of the presentation (appears on the first slide)"),
        information: z.string().describe("Content for slides. Use '---' on separate lines to divide slides. The first line of each section becomes the slide title, the rest are bullet points."),
        filename: z.string().optional().describe("Output filename without extension (default: 'Presentation')"),
        autoOpen: z.boolean().optional().describe("Automatically open the file after creation (default: true)")
      },
      async ({ topic, information, filename = 'Presentation', autoOpen = true }) =>
        createPPT({ topic, information, filename, autoOpen })
    );

    //web scraper
    // ─── Web Scraper Tools ──────────────────────────────────────
    server.tool(
      "scrape_page",
      "Scrape the text content of a webpage (or a specific CSS selector) and return the text (first 2000 chars).",
      {
        url: z.string().describe("The URL to scrape"),
        selector: z.string().optional().describe("CSS selector to target a specific element (default: 'body')")
      },
      async ({ url, selector = 'body' }) => scrapePage(url, selector)
    );

    server.tool(
      "monitor_changes",
      "Start monitoring a webpage for changes. Every interval, it checks if the content has changed and logs a notification.",
      {
        url: z.string().describe("URL to monitor"),
        interval_minutes: z.number().optional().describe("Check interval in minutes (default: 60)"),
        selector: z.string().optional().describe("CSS selector to monitor (default: 'body')")
      },
      async ({ url, interval_minutes = 60, selector = 'body' }) =>
        monitorChanges(url, interval_minutes, selector)
    );

    server.tool(
      "extract_structured_data",
      "Extract structured data from a webpage using a CSS selector. Returns an array of the text content of all matching elements.",
      {
        url: z.string().describe("URL to scrape"),
        selector: z.string().describe("CSS selector to extract data from")
      },
      async ({ url, selector }) => extractStructuredData(url, selector)
    );


    //Finance
    // ─── Personal Finance Advisor ──────────────────────────────
    server.tool(
      "set_budget",
      "Set a monthly budget for a spending category.",
      { category: z.string(), limit: z.number(), period: z.enum(["monthly", "yearly"]).optional() },
      async ({ category, limit, period }) => setBudget(category, limit, period)
    );

    server.tool(
      "budget_status",
      "Show current spending vs budgets for this month.",
      {},
      async () => getBudgetStatus()
    );

    server.tool(
      "add_bill",
      "Add a recurring bill to track.",
      { name: z.string(), amount: z.number(), dueDate: z.string(), category: z.string().optional(), recurrence: z.enum(["monthly", "quarterly", "yearly"]).optional() },
      async ({ name, amount, dueDate, category, recurrence }) => addBill(name, amount, dueDate, category, recurrence)
    );

    server.tool(
      "check_bills",
      "Check for upcoming bills in the next 7 days.",
      {},
      async () => checkUpcomingBills()
    );

    server.tool(
      "financial_health",
      "Get a comprehensive financial health summary.",
      {},
      async () => getFinancialHealth()
    );

    server.tool(
      "forecast_spending",
      "Forecast spending over the next N days based on history.",
      { days: z.number().optional() },
      async ({ days = 30 }) => forecastSpending(days)
    );

    server.tool("list_bills", "Show all saved bills (past, future, active)", {}, async () => listAllBills());
    // Optional: you can also register `autoFinancialCheck` for scheduled cron jobs.

    // ─── Package Tracker ─────────────────────────────────────────
    server.tool("add_package", "Add a package to track", { trackingNumber: z.string(), carrier: z.enum(["ups", "fedex", "usps", "dhl", "amazon"]), name: z.string().optional() },
      async ({ trackingNumber, carrier, name }) => addPackage(trackingNumber, carrier, name)
    );
    server.tool("list_packages", "List all tracked packages", {}, async () => listPackages());
    server.tool("check_packages", "Check status of all tracked packages", { notify: z.boolean().optional() },
      async ({ notify = true }) => checkAllPackages(notify)
    );
    server.tool("remove_package", "Remove a tracked package", { id: z.string() }, async ({ id }) => removePackage(id));

    // ─── Wellness Coach ──────────────────────────────────────────
    server.tool("start_wellness_session", "Start a wellness (screen time) session", { type: z.enum(["work", "study", "general"]).optional() },
      async ({ type = "work" }) => startWellnessSession(type)
    );
    server.tool("stop_wellness_session", "Stop the current session", {}, async () => stopWellnessSession());
    server.tool("take_break", "Take a break during the current session", {}, async () => takeBreak());
    server.tool("set_wellness_goals", "Set daily screen time and break goals", { dailyLimitHours: z.number(), breakIntervalMinutes: z.number(), breakDurationMinutes: z.number() },
      async ({ dailyLimitHours, breakIntervalMinutes, breakDurationMinutes }) => setWellnessGoals(dailyLimitHours, breakIntervalMinutes, breakDurationMinutes)
    );
    server.tool("today_wellness", "Get today's screen time summary", {}, async () => getTodayWellness());
    server.tool("reset_wellness", "Reset the current session", {}, async () => resetWellnessSession());


    // Subscription Manager
    // ─── Subscription Manager ──────────────────────────────────
    server.tool("add_subscription", "Add a subscription to track.",
      { name: z.string(), cost: z.number(), renewalDate: z.string(), category: z.string().optional() },
      async ({ name, cost, renewalDate, category }) => addSubscription(name, cost, renewalDate, category)
    );
    server.tool("list_subscriptions", "List all tracked subscriptions.",
      {}, async () => listSubscriptions()
    );
    server.tool("check_renewals", "Check subscriptions renewing in the next 7 days.",
      {}, async () => checkRenewals()
    );
    server.tool("cancel_subscription", "Cancel a subscription (mark inactive).",
      { id: z.string() }, async ({ id }) => cancelSubscription(id)
    );

    // ─── Job Tracker ────────────────────────────────────────────
    server.tool("add_job", "Add a job application.",
      { company: z.string(), role: z.string(), status: z.enum(["applied", "interview", "offer", "rejected"]).optional(), deadline: z.string().optional(), notes: z.string().optional() },
      async ({ company, role, status, deadline, notes }) => addJob(company, role, status, deadline, notes)
    );
    server.tool("list_jobs", "List job applications.",
      { filter: z.enum(["all", "applied", "interview", "offer", "rejected"]).optional() },
      async ({ filter }) => listJobs(filter)
    );
    server.tool("update_job_status", "Update the status of a job application.",
      { id: z.string(), status: z.enum(["applied", "interview", "offer", "rejected"]), notes: z.string().optional() },
      async ({ id, status, notes }) => updateJobStatus(id, status, notes)
    );
    server.tool("check_followups", "Check for applications needing a follow‑up (applied > 7 days ago).",
      {}, async () => checkFollowUps()
    );

    // ─── Document Organizer ──────────────────────────────────────
    server.tool("organize_file", "Manually organize a file (move, rename, summarise).",
      { filePath: z.string() },
      async ({ filePath }) => organizeFile(filePath)
    );
    server.tool("start_watcher", "Start the automatic document watcher (background).",
      {}, async () => startDocumentWatcher()
    );
    server.tool("stop_watcher", "Stop the automatic document watcher.",
      {}, async () => stopDocumentWatcher()
    );
    server.tool("organize_existing", "Organise all existing files in the watched folder.",
      {}, async () => organizeExistingFiles()
    );


   server.tool(
  "plan_detailed_trip",
  `Generate an extremely detailed travel itinerary with real-time data (weather, attractions, accommodation).
  
  **When to use:** The user asks for a very detailed travel plan, itinerary, or trip planner.
  
  **Parameters:**
  - destination: city or country
  - numDays: number of days (default 7)
  - preferences: e.g., adventure, culture, food
  - budget: total budget in USD (default 2000)
  - startDate: YYYY-MM-DD (default today)
  - email: optional email to send the itinerary`,
  {
    destination: z.string().describe("Destination city or country"),
    numDays: z.number().optional().describe("Number of days (default 7)"),
    preferences: z.string().optional().describe("Travel preferences (e.g., adventure, food, culture)"),
    budget: z.number().optional().describe("Total budget in USD (default 2000)"),
    startDate: z.string().optional().describe("Start date in YYYY-MM-DD format (default today)"),
    email: z.string().optional().describe("Email address to send the itinerary"),
  },
  async ({ destination, numDays, preferences, budget, startDate, email }) =>
    planDetailedTrip({ destination, numDays, preferences, budget, startDate, email })
);


server.tool(
  "generate_audio_tour",
  `Generate a personalized audio tour script for any location, with optional TTS audio.
  
  **When to use:** The user wants a self‑guided audio tour of a place (city, landmark, neighbourhood).
  
  **Parameters:**
  - location: string (e.g., "Paris", "Colosseum")
  - interests: array of strings from ["History", "Architecture", "Culinary", "Culture"] (default: ["History", "Architecture"])
  - durationMinutes: number (default: 10)
  - generateAudio: boolean (if true, also produce an MP3 file)`,
  {
    location: z.string().describe("City, landmark, or neighbourhood"),
    interests: z.array(z.enum(["History", "Architecture", "Culinary", "Culture"])).optional().describe("Topics to cover"),
    durationMinutes: z.number().min(5).max(60).optional().describe("Tour duration in minutes (default 10)"),
    generateAudio: z.boolean().optional().describe("Generate an MP3 audio file (requires OpenAI API key or system TTS)"),
  },
  async ({ location, interests = ["History", "Architecture"], durationMinutes = 10, generateAudio = false }) =>
    generateAudioTour({ location, interests, durationMinutes, generateAudio })
);


server.tool(
  "run_gtm_outreach",
  `Run a full GTM B2B outreach workflow: find companies, contacts, research insights, and generate personalised emails.
  
  **Parameters:**
  - targetDesc: description of target companies (industry, size, region, tech stack, etc.)
  - offeringDesc: your product/service offering (1-3 sentences)
  - senderName: your name (default: "Sales Team")
  - senderCompany: your company name (default: "Our Company")
  - calendarLink: optional calendar booking link
  - numCompanies: number of companies to target (1-10, default 5)
  - emailStyle: "Professional", "Casual", "Cold", "Consultative" (default "Professional")
  - saveResults: save to file (default true)`,
  {
    targetDesc: z.string().describe("Description of target companies"),
    offeringDesc: z.string().describe("Your product/service offering"),
    senderName: z.string().optional().describe("Your name"),
    senderCompany: z.string().optional().describe("Your company name"),
    calendarLink: z.string().optional().describe("Calendar booking link"),
    numCompanies: z.number().min(1).max(10).optional().describe("Number of companies (1-10)"),
    emailStyle: z.enum(["Professional", "Casual", "Cold", "Consultative"]).optional().describe("Email tone/style"),
    saveResults: z.boolean().optional().describe("Save results to file"),
  },
  async ({
    targetDesc,
    offeringDesc,
    senderName = 'Sales Team',
    senderCompany = 'Our Company',
    calendarLink = '',
    numCompanies = 5,
    emailStyle = 'Professional',
    saveResults = true,
  }) =>
    runGTMOutreach({
      targetDesc,
      offeringDesc,
      senderName,
      senderCompany,
      calendarLink,
      numCompanies,
      emailStyle,
      saveResults,
    })
);
    server.tool(
      "summarize_youtube",
      "Summarize a YouTube video, generate a PDF, and optionally email it.",
      {
        videoUrl: z.string().describe("Full YouTube video URL"),
        email: z.string().optional().describe("Email to send the summary to (optional)")
      },
      async ({ videoUrl, email }) => summarizeYouTubeVideo(videoUrl, email)
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
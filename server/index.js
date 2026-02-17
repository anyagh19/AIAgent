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


const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
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
    const server = new McpServer({
      name: "example-server",
      version: "1.0.0"
    });

    // ... set up server resources, tools, and prompts ...
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

    // NEW: Computer Control Tool
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
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.listen(3000);
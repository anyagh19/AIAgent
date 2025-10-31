import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import z from "zod";
import { createPost, getTweets } from "./mcp.tool.js";
import { apiResponse } from "./mail.tool.js";
import { analyzeScreenshot } from "./screenshot.tool.js";



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
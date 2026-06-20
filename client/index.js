import express from 'express';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env file
config();

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: "myclientsecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ===================== GEMINI API KEY ROTATION =====================
const rawKeys = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0)
  : [process.env.GEMINI_API_KEY].filter(Boolean);

// Filter out obviously invalid keys (Gemini keys start with AIza)
const validKeys = rawKeys.filter(k => /^AIza[ -~]+$/.test(k));

if (validKeys.length === 0) {
  console.error('❌ No valid Gemini API keys found. Set GEMINI_API_KEYS or GEMINI_API_KEY in .env');
  console.error('   Expected format: AIza... (each key starts with "AIza")');
  process.exit(1);
}

console.log(`🔑 Loaded ${validKeys.length} Gemini API key(s)`);
validKeys.forEach((k, i) => {
  console.log(`   Key ${i + 1}: ${k.slice(0, 12)}...${k.slice(-4)}`);
});

const keyManager = {
  keys: validKeys,
  currentIndex: 0,
  rateLimitedUntil: {},   // key -> timestamp when cooldown ends
  invalidKeys: new Set(), // permanently skip these

  getAvailableKey() {
    const now = Date.now();
    // Try all keys, skipping rate‑limited and known‑invalid ones
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      if (this.invalidKeys.has(key)) continue;
      if (!this.rateLimitedUntil[key] || this.rateLimitedUntil[key] <= now) {
        this.currentIndex = idx;
        return key;
      }
    }
    // All keys are either rate‑limited or invalid – fallback to the first non‑invalid
    for (let key of this.keys) {
      if (!this.invalidKeys.has(key)) return key;
    }
    return this.keys[0]; // last resort
  },

  markRateLimited(key, cooldownMs = 60_000) {
    this.rateLimitedUntil[key] = Date.now() + cooldownMs;
    console.warn(`[KeyRotation] Key ${key.slice(0,12)}... rate‑limited. Cooldown until ${new Date(this.rateLimitedUntil[key]).toLocaleTimeString()}`);
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
  },

  markInvalid(key) {
    this.invalidKeys.add(key);
    console.error(`[KeyRotation] Key ${key.slice(0,12)}... marked as INVALID and will be skipped permanently.`);
    // Remove from rate‑limited map
    delete this.rateLimitedUntil[key];
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
  },

  isAllInvalid() {
    return this.keys.every(k => this.invalidKeys.has(k));
  }
};

// Helper to create a new AI client with a given key
function createGeminiClient(apiKey) {
  return new GoogleGenAI({ apiKey });
}
// ===============================================================

// MCP Client configuration
let mcpClient = null;
let tools = [];
const chatHistories = {}; // Store chat history per user session
let pendingRedirect = null;
let isConnecting = false;

// --- Helper function to get/initialize chat history ---
function getChatHistory(sessionId) {
    if (!chatHistories[sessionId]) {
        chatHistories[sessionId] = [];
    }
    return chatHistories[sessionId];
}

// --- MCP Client Connection Management ---

async function connectMCPClient(token) {
    if (isConnecting) {
        console.log("Already connecting to MCP server, waiting...");
        while (isConnecting) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return mcpClient !== null;
    }

    isConnecting = true;

    try {
        console.log("Connecting to MCP server (http://localhost:3000/mcp)...");

        mcpClient = new Client({
            name: 'express-web-client',
            version: '1.0.0'
        });

        const transport = new StreamableHTTPClientTransport(
            new URL('http://localhost:3000/mcp'),
            {
                requestInit: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        await mcpClient.connect(transport);
        console.log("Connected to MCP server.");

        const toolsList = await mcpClient.listTools();
        tools = toolsList.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: tool.inputSchema.type,
                properties: tool.inputSchema.properties,
                required: tool.inputSchema.required || [],
            },
        }));

        console.log("Tools loaded:", tools.map(t => t.name));
        isConnecting = false;
        return true;

    } catch (err) {
        console.error("Failed to connect to MCP server:", err);
        mcpClient = null;
        tools = [];
        isConnecting = false;
        return false;
    }
}

async function ensureMCPConnection(token) {
    if (mcpClient) {
        try {
            await mcpClient.listTools();
            return true;
        } catch (err) {
            console.log("MCP connection lost, reconnecting...");
            mcpClient = null;
        }
    }

    return await connectMCPClient(token);
}

// --- AI Logic Function ---

async function getGeminiResponse(userMessage, sessionId, token) {
    pendingRedirect = null;
    const chatHistory = getChatHistory(sessionId);

    const isConnected = await ensureMCPConnection(token);

    if (!isConnected) {
        const errorMessage = "Unable to connect to the MCP server. Please ensure you're logged in and the server is running.";
        chatHistory.push({
            role: 'model',
            parts: [{ text: errorMessage, type: 'text' }],
        });
        return errorMessage;
    }

    chatHistory.push({
        role: 'user',
        parts: [{ text: userMessage, type: 'text' }],
    });

    try {
        let lastPart = null;
        let responseText = null;
        let maxIterations = 10;
        let iterations = 0;

        while (iterations < maxIterations) {
            iterations++;

            // ===== RETRY WITH MULTIPLE KEYS ON RATE LIMIT / INVALID =====
            let geminiResponse;
            let attempt = 0;
            const maxAttempts = keyManager.keys.length * 3; // try a bit more

            while (attempt < maxAttempts) {
                const currentKey = keyManager.getAvailableKey();
                const ai = createGeminiClient(currentKey);
                try {
                    geminiResponse = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: chatHistory,
                        config: {
                            tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
                        },
                    });
                    break; // success – exit retry loop
                } catch (apiError) {
                    const msg = apiError.message || '';
                    const isRateLimit =
                        apiError.status === 429 ||
                        /quota|rate|exceeded/i.test(msg);

                    const isInvalidKey =
                        apiError.status === 400 &&
                        (/api key not valid/i.test(msg) ||
                         /invalid_argument/i.test(msg) ||
                         /api_key_invalid/i.test(msg));

                    if (isRateLimit) {
                        keyManager.markRateLimited(currentKey);
                        attempt++;
                        console.log(`[KeyRotation] Retrying with next key (attempt ${attempt}/${maxAttempts})`);
                    } else if (isInvalidKey) {
                        // Permanently skip this invalid key
                        keyManager.markInvalid(currentKey);
                        attempt++;
                        if (keyManager.isAllInvalid()) {
                            throw new Error('All Gemini API keys are invalid. Please check your .env file.');
                        }
                        console.log(`[KeyRotation] Skipping invalid key, trying next (attempt ${attempt}/${maxAttempts})`);
                    } else {
                        // Unknown error – throw immediately
                        throw apiError;
                    }
                }
            }

            if (!geminiResponse) {
                throw new Error('All Gemini API keys are currently rate‑limited or invalid. Please try again later.');
            }

            const response = geminiResponse;
            // =================================================

            const candidate = response?.candidates?.[0];

            if (!candidate || !candidate.content) {
                console.error("Invalid Gemini response:", JSON.stringify(response, null, 2));

                if (candidate && candidate.finishReason === 'STOP') {
                    responseText = "Task completed successfully!";
                    chatHistory.push({
                        role: 'model',
                        parts: [{ text: responseText, type: 'text' }],
                    });
                    break;
                }

                throw new Error("Gemini returned unexpected structure");
            }

            if (!candidate.content.parts || candidate.content.parts.length === 0) {
                console.log("Gemini returned empty parts - task likely completed via tool");
                responseText = "Done! The action has been completed.";
                chatHistory.push({
                    role: 'model',
                    parts: [{ text: responseText, type: 'text' }],
                });
                break;
            }

            lastPart = candidate.content.parts[0];

            if (lastPart.functionCall) {
                const toolCall = lastPart.functionCall;
                console.log(`AI called tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`);

                chatHistory.push({
                    role: 'model',
                    parts: [{ functionCall: toolCall }],
                });

                await ensureMCPConnection(token);

                if (!mcpClient) {
                    const errorMsg = "Lost connection to MCP server. Please try again.";
                    chatHistory.push({
                        role: 'function',
                        parts: [{
                            functionResponse: {
                                name: toolCall.name,
                                response: { result: errorMsg }
                            }
                        }],
                    });
                    continue;
                }

                try {
                    const toolResult = await mcpClient.callTool({
                        name: toolCall.name,
                        arguments: toolCall.args,
                    });

                    const toolResultText = toolResult.content?.[0]?.text || "Tool executed successfully";
                    console.log(`Tool result: ${toolResultText}`);

                    if (toolResult.metadata?.action === "open_tab") {
                        pendingRedirect = toolResult.metadata.url;
                        console.log("Redirect detected and stored:", pendingRedirect);
                    }

                    chatHistory.push({
                        role: 'function',
                        parts: [{
                            functionResponse: {
                                name: toolCall.name,
                                response: { result: toolResultText }
                            }
                        }],
                    });

                } catch (toolError) {
                    console.error("Tool execution error:", toolError);

                    chatHistory.push({
                        role: 'function',
                        parts: [{
                            functionResponse: {
                                name: toolCall.name,
                                response: {
                                    result: `Error executing tool: ${toolError.message}`
                                }
                            }
                        }],
                    });
                }

            } else if (lastPart.text) {
                responseText = lastPart.text;
                chatHistory.push({
                    role: 'model',
                    parts: [{ text: responseText, type: 'text' }],
                });
                break;
            } else {
                responseText = "I didn't get a clear response. Can you rephrase?";
                chatHistory.push({
                    role: 'model',
                    parts: [{ text: responseText, type: 'text' }],
                });
                break;
            }
        }

        if (iterations >= maxIterations) {
            responseText = "I've reached the maximum number of processing steps. Please try rephrasing your request.";
            chatHistory.push({
                role: 'model',
                parts: [{ text: responseText, type: 'text' }],
            });
        }

        return responseText;

    } catch (error) {
        console.error("Error during Gemini interaction or tool execution:", error);
        const errorMessage = "Oops! Something went wrong while processing your request. Please try again.";
        chatHistory.push({
            role: 'model',
            parts: [{ text: errorMessage, type: 'text' }],
        });
        return errorMessage;
    }
}

// --- Middleware ---
const requireLogin = (req, res, next) => {
    if (!req.session.token) {
        return res.redirect("/login");
    }
    next();
};

// --- Express Routes ---

// Login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Signup page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Login POST
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const response = await fetch("http://localhost:3000/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.token) {
            req.session.token = data.token;

            // Initialize chat history for this session
            const chatHistory = getChatHistory(req.sessionID);
            chatHistory.push({
                role: 'model',
                parts: [{ text: "Hello! I'm your AI assistant. How can I help you today?", type: 'text' }],
            });

            return res.redirect("/");
        }

        res.render('login', { error: data.message || "Login failed" });

    } catch (error) {
        console.error("Login error:", error);
        res.render('login', { error: "Server error. Please try again." });
    }
});

// Signup POST
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    try {
        const response = await fetch("http://localhost:3000/signup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            res.render('signup', { success: data.message });
        } else {
            res.render('signup', { error: data.message || "Signup failed" });
        }

    } catch (error) {
        console.error("Signup error:", error);
        res.render('signup', { error: "Server error. Please try again." });
    }
});

// Logout
app.get("/logout", (req, res) => {
    const sessionId = req.sessionID;

    // Clear chat history for this session
    if (chatHistories[sessionId]) {
        delete chatHistories[sessionId];
    }

    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// Main chat page (protected)
app.get('/', requireLogin, (req, res) => {
    const chatHistory = getChatHistory(req.sessionID);

    res.render('index', {
        chatHistory,
        redirectUrl: pendingRedirect
    });
    pendingRedirect = null;
});

// Ask endpoint (protected)
app.post('/ask', requireLogin, async (req, res) => {
    const userMessage = req.body.message;
    const isAjax = req.headers.accept === 'application/json' || req.query.ajax === '1';

    if (!userMessage) {
        return isAjax ? res.json({ error: 'No message' }) : res.redirect('/');
    }

    const responseText = await getGeminiResponse(userMessage, req.sessionID, req.session.token);

    if (isAjax) {
        // Return JSON for frontend dynamic update
        return res.json({
            response: responseText,
            redirectUrl: pendingRedirect || null
        });
    }

    // Traditional form submit
    res.redirect('/');
});

// Reset chat (protected)
app.post('/reset', requireLogin, (req, res) => {
    const chatHistory = getChatHistory(req.sessionID);
    chatHistory.length = 0;
    pendingRedirect = null;
    chatHistory.push({
        role: 'model',
        parts: [{ text: "Chat history cleared. How can I help you start fresh?", type: 'text' }],
    });
    res.redirect('/');
});

// --- Server Initialization ---

app.listen(PORT, () => {
    console.log(`Web server running at http://localhost:${PORT}`);
});
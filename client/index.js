import express from 'express';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env file
config();

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000; // Port for your web server

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Gemini configuration
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// MCP Client configuration
let mcpClient = null;
let tools = [];
const chatHistory = [];
let pendingRedirect = null;
let isConnecting = false;

// --- MCP Client Connection Management ---

async function connectMCPClient() {
    if (isConnecting) {
        console.log("Already connecting to MCP server, waiting...");
        // Wait for the current connection attempt to complete
        while (isConnecting) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return mcpClient !== null;
    }

    isConnecting = true;

    try {
        console.log("Connecting to MCP server (http://localhost:3000/mcp)...");
        
        // Create a new client instance
        mcpClient = new Client({ 
            name: 'express-web-client', 
            version: '1.0.0' 
        });

        // Create transport
        const transport = new StreamableHTTPClientTransport(
            new URL('http://localhost:3000/mcp')
        );

        // Connect to the MCP server
        await mcpClient.connect(transport);
        
        console.log("Connected to MCP server.");

        // Fetch the list of tools
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

// Function to ensure MCP client is connected
async function ensureMCPConnection() {
    if (mcpClient) {
        // Test if connection is still alive
        try {
            await mcpClient.listTools();
            return true;
        } catch (err) {
            console.log("MCP connection lost, reconnecting...");
            mcpClient = null;
        }
    }
    
    return await connectMCPClient();
}

// --- AI Logic Function ---

async function getGeminiResponse(userMessage) {
    // Clear any previous redirect
    pendingRedirect = null;

    // Ensure MCP connection before processing
    const isConnected = await ensureMCPConnection();
    
    if (!isConnected) {
        const errorMessage = "Unable to connect to the MCP server. Please ensure the server is running on port 3000.";
        chatHistory.push({
            role: 'model',
            parts: [{ text: errorMessage, type: 'text' }],
        });
        return errorMessage;
    }

    // Add user's message to chat history
    chatHistory.push({
        role: 'user',
        parts: [{ text: userMessage, type: 'text' }],
    });

    try {
        let lastPart = null;
        let responseText = null;
        let maxIterations = 10; // Prevent infinite loops
        let iterations = 0;

        while (iterations < maxIterations) {
            iterations++;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: chatHistory,
                config: {
                    tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
                },
            });

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

                // Add the tool call to chat history
                chatHistory.push({
                    role: 'model',
                    parts: [{ functionCall: toolCall }],
                });

                // Ensure connection before calling tool
                await ensureMCPConnection();

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
                    // Execute the tool via the MCP client
                    const toolResult = await mcpClient.callTool({
                        name: toolCall.name,
                        arguments: toolCall.args,
                    });

                    const toolResultText = toolResult.content?.[0]?.text || "Tool executed successfully";
                    console.log(`Tool result: ${toolResultText}`);

                    // Handle redirect metadata
                    if (toolResult.metadata?.action === "open_tab") {
                        pendingRedirect = toolResult.metadata.url;
                        console.log("Redirect detected and stored:", pendingRedirect);
                    }

                    // Add the tool result to chat history
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
                    
                    // Add error to chat history so Gemini can respond
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

// --- Express Routes ---

app.get('/', (req, res) => {
    res.render('index', { 
        chatHistory,
        redirectUrl: pendingRedirect 
    });
    pendingRedirect = null;
});

app.post('/ask', async (req, res) => {
    const userMessage = req.body.message;
    if (userMessage) {
        await getGeminiResponse(userMessage);
    }
    res.redirect('/');
});

app.post('/reset', (req, res) => {
    chatHistory.length = 0;
    pendingRedirect = null;
    chatHistory.push({
        role: 'model',
        parts: [{ text: "Chat history cleared. How can I help you start fresh?", type: 'text' }],
    });
    res.redirect('/');
});

// --- Server Initialization ---

(async () => {
    // Try to connect to MCP server
    const connected = await connectMCPClient();
    
    if (connected) {
        chatHistory.push({
            role: 'model',
            parts: [{ text: "Hello there! I'm an AI assistant. How can I help you today?", type: 'text' }],
        });
    } else {
        chatHistory.push({
            role: 'model',
            parts: [{ text: "⚠️ Warning: Could not connect to the MCP server. Some features may be unavailable. Please ensure your MCP server is running on port 3000.", type: 'text' }],
        });
    }

    // Start web server regardless of MCP connection status
    app.listen(PORT, () => {
        console.log(`Web server running at http://localhost:${PORT}`);
    });
})();
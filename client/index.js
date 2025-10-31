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
// Set the directory for EJS views (assuming index.ejs is in a 'views' folder)
app.set('views', path.join(__dirname, 'views'));
// Middleware to parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory (if you have any, e.g., CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Gemini and Model Context Protocol (MCP) configuration
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Initialize MCP Client which will connect to your MCP Server (running on port 3000)
const mcpClient = new Client({ name: 'express-web-client', version: '1.0.0' });

let tools = []; // Stores the function declarations for tools
const chatHistory = []; // Stores the conversation history for the AI model

// --- MCP Client Initialization and Tool Loading ---
// This block runs once when the server starts
(async () => {
    try {
        console.log("Connecting to MCP server (http://localhost:3000/mcp)...");
        await mcpClient.connect(
            new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'))
        );
        console.log("Connected to MCP server.");

        // Fetch the list of tools exposed by your MCP server
        tools = (await mcpClient.listTools()).tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: tool.inputSchema.type,
                properties: tool.inputSchema.properties,
                required: tool.inputSchema.required || [],
            },
        }));
        console.log("Tools loaded:", tools.map(t => t.name));

        // Add an initial message from the AI to the chat history
        chatHistory.push({
            role: 'model',
            parts: [{ text: "Hello there! I'm an AI assistant. How can I help you today?", type: 'text' }],
        });

    } catch (err) {
        console.error("Failed to connect to MCP server or load tools:", err);
        // Push an error message to chat history if connection fails
        chatHistory.push({
            role: 'model',
            parts: [{ text: "Error: Could not connect to the AI assistant. Please ensure your MCP server (on port 3000) is running.", type: 'text' }],
        });
    }

    // Start server only after MCP client is connected and tools are loaded
    app.listen(PORT, () => {
        console.log(`Web server running at http://localhost:${PORT}`);
    });
})();


// --- AI Logic Function ---
// This function handles sending messages to Gemini and processing tool calls
async function getGeminiResponse(userMessage) {
    // Add user's message to chat history
    chatHistory.push({
        role: 'user',
        parts: [{ text: userMessage, type: 'text' }],
    });

    try {
        let lastPart = null;
        let responseText = null;

        // Loop to handle multi-turn interactions (e.g., tool call followed by AI response)
        while (true) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: chatHistory, // Send the full conversation history
                config: {
                    tools: [{ functionDeclarations: tools }], // Provide available tools to Gemini
                },
            });

            lastPart = response.candidates[0].content.parts[0];

            if (lastPart.functionCall) {
                // If Gemini wants to call a tool
                const toolCall = lastPart.functionCall;
                console.log(`AI called tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`);

                // Add the tool call to chat history (for context in next AI turn)
                chatHistory.push({
                    role: 'model',
                    parts: [{ functionCall: toolCall }],
                });

                // Execute the tool via the MCP client
                const toolResult = await mcpClient.callTool({
                    name: toolCall.name,
                    arguments: toolCall.args,
                });

                // Extract the text content from the tool result
                // Handle cases where toolResult.content[0] might be undefined or not have 'text'
                const toolResultText = toolResult.content?.[0]?.text || JSON.stringify(toolResult);
                console.log(`Tool result: ${toolResultText}`);

                // Add the tool result to chat history
                chatHistory.push({
                    role: 'model',
                    parts: [{ toolCode: toolCall.name, text: toolResultText }],
                });

                // Set userMessage to empty string to signal that the AI should continue processing
                // based on the tool result in the next iteration of the loop.
                userMessage = "";

            } else if (lastPart.text) {
                // If Gemini responded with natural language text

                responseText = lastPart.text;
                // Add AI's text response to chat history
                chatHistory.push({
                    role: 'model',
                    parts: [{ text: responseText, type: 'text' }],
                });
                break;// Exit loop, as we have a final text response
            } else {
                // Fallback for unexpected AI response
                responseText = "I didn't get a clear response. Can you rephrase?";
                chatHistory.push({
                    role: 'model',
                    parts: [{ text: responseText, type: 'text' }],
                });
                break; // Exit loop
            }
        }
        return responseText; // Return the final AI text response
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

// Route to display the chat page
app.get('/', (req, res) => {
    res.render('index', { chatHistory }); // Pass the chat history to the EJS template
});

// Route to handle user messages (form submission)
app.post('/ask', async (req, res) => {
    const userMessage = req.body.message; // Get the message from the form input
    if (userMessage) {
        await getGeminiResponse(userMessage); // Process the message with Gemini/tools
    }
    res.redirect('/'); // Redirect back to the home page to display updated chat
});

// Route to reset the chat history
app.post('/reset', (req, res) => {
    chatHistory.length = 0; // Clear the array
    // Add initial AI message after reset
    chatHistory.push({
        role: 'model',
        parts: [{ text: "Chat history cleared. How can I help you start fresh?", type: 'text' }],
    });
    res.redirect('/');
});

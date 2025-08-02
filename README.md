# AI MCP Server & Chat API with Twitter Posting Tool

This is a Node.js project demonstrating an MCP (Model Context Protocol) server combined with a chatbot API using Google GenAI. It includes:

- An MCP server exposing custom tools like:
  - `addTwoNumbers` (adds two numbers)
  - `createPost` (creates a Twitter post via Twitter API v2)
- A chatbot API endpoint that:
  - Processes user messages with Google GenAI
  - Calls MCP tools when AI requests
  - Returns plain AI-generated replies when no tool call is required
- Uses Express.js to serve both MCP and chatbot APIs on the same HTTP server.

---

## Prerequisites

- Node.js v18 or newer
- Twitter Developer account with API keys and tokens (for `createPost` tool)
- Google Cloud API key for Google GenAI (`GEMINI_API_KEY`)

---

## Setup

1. Clone the repository and install dependencies:


2. Create a `.env` file in the root directory with your API keys:


3. Run the server:


---

## API Endpoints

### MCP Server

- **POST** `/mcp`  
Handles MCP connections and tool calls.

- **GET** `/mcp`  
Supports server-to-client notifications.

- **DELETE** `/mcp`  
Terminates MCP sessions.

### Chatbot API

- **POST** `/chat/api`  
Accepts JSON with:


Returns JSON containing the AI reply or tool output:


---

## Tools

- `addTwoNumbers`: Adds two numbers.
- `createPost`: Posts a status update to Twitter using your Twitter developer credentials.

---

## Usage

You can interact with the chatbot via the `/chat/api` endpoint by sending messages and maintaining the `chatHistory` for context.

Tools will be automatically invoked when Google GenAI response includes a function call.

---

## License

MIT License

---

## Author

Anya19

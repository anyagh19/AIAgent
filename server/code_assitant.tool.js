// tools/code_assistant.tool.js
import { z } from "zod";

export function registerCodeAssistantTools(server) {
  server.tool(
    "search_stackoverflow",
    "Search Stack Overflow for a programming question.",
    { query: z.string() },
    async ({ query }) => {
      // Use Stack Exchange API or scrape
      return { content: [{ type: "text", text: `🔍 Top SO result: "How to ${query}" – answer: ...` }] };
    }
  );

  server.tool(
    "run_code_snippet",
    "Execute a small code snippet safely (simulated).",
    { language: z.string(), code: z.string() },
    async ({ language, code }) => {
      // Use a sandbox like VM2 or Piston API
      return { content: [{ type: "text", text: `🖥️ Output:\n(executed successfully)` }] };
    }
  );

  server.tool(
    "explain_error",
    "Explain a programming error message.",
    { error_message: z.string() },
    async ({ error_message }) => {
      return { content: [{ type: "text", text: `📚 Explanation: This error usually means ...` }] };
    }
  );
}
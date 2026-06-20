// tools/smart_reminders.tool.js
import { z } from "zod";

export function registerSmartRemindersTools(server) {
  server.tool(
    "set_smart_reminder",
    "Set a reminder with optional location or time trigger.",
    {
      text: z.string(),
      time: z.string().optional(),
      location: z.string().optional()
    },
    async ({ text, time, location }) => {
      const trigger = location ? `when I arrive at ${location}` : `at ${time}`;
      return { content: [{ type: "text", text: `⏰ Reminder set: "${text}" ${trigger}.` }] };
    }
  );

  server.tool(
    "list_reminders",
    "Show all active reminders.",
    {},
    async () => {
      return { content: [{ type: "text", text: "🔔 Active reminders:\n- Call mom (when leaving work)\n- Submit report (5pm)" }] };
    }
  );
}
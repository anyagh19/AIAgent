// desktop_notification.tool.js
import notifier from 'node-notifier';

export async function notify(title, message) {
  try {
    notifier.notify({
      title,
      message,
      sound: true,
      wait: false,
    });
    return {
      content: [{ type: 'text', text: `🔔 Notification sent: "${title}"` }]
    };
  } catch (error) {
    // Fallback: log to console
    console.log(`🔔 [NOTIFICATION] ${title}: ${message}`);
    return {
      content: [{ type: 'text', text: `⚠️ Notification attempted (error: ${error.message})` }],
      isError: true,
    };
  }
}
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs/promises';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'tokens', 'calendar-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials', 'calendar-credentials.json');

let cachedAuth = null;

async function getAuthClient() {
  if (cachedAuth) return cachedAuth;

  try {
    // Try to load saved token
    const token = await fs.readFile(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(token);
    
    const auth = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri
    );
    auth.setCredentials(credentials.tokens);
    
    cachedAuth = auth;
    return auth;
  } catch (error) {
    // Need fresh authentication
    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    
    // Save token for future use
    await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.writeFile(TOKEN_PATH, JSON.stringify({
      client_id: auth._clientId,
      client_secret: auth._clientSecret,
      redirect_uri: auth.redirectUri,
      tokens: auth.credentials
    }));
    
    cachedAuth = auth;
    return auth;
  }
}

export async function getUpcomingEvents(maxResults = 10, timeMin = null, timeMax = null) {
  try {
    const auth = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const params = {
      calendarId: 'primary',
      timeMin: timeMin || now.toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    };

    if (timeMax) {
      params.timeMax = timeMax;
    }

    const response = await calendar.events.list(params);
    const events = response.data.items;

    if (!events || events.length === 0) {
      return {
        content: [{
          type: "text",
          text: "📅 No upcoming events found."
        }]
      };
    }

    let output = `📅 **Upcoming Events (${events.length})**\n\n`;
    events.forEach((event, i) => {
      const start = event.start.dateTime || event.start.date;
      const startDate = new Date(start);
      output += `${i + 1}. **${event.summary}**\n`;
      output += `   📅 ${startDate.toLocaleString()}\n`;
      if (event.location) output += `   📍 ${event.location}\n`;
      if (event.description) output += `   📝 ${event.description.substring(0, 100)}...\n`;
      output += '\n';
    });

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Calendar error: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function createEvent(summary, startTime, endTime, description = '', location = '') {
  try {
    const auth = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: summary,
      location: location,
      description: description,
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return {
      content: [{
        type: "text",
        text: `✅ Event created successfully!\n\n📅 **${summary}**\n⏰ ${new Date(startTime).toLocaleString()}\n🔗 ${response.data.htmlLink}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to create event: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function findFreeSlots(date, duration = 60) {
  try {
    const auth = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const startOfDay = new Date(date);
    startOfDay.setHours(9, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(18, 0, 0, 0);

    const response = await calendar.freebusy.query({
      resource: {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busy = response.data.calendars.primary.busy;
    const freeSlots = [];
    let currentTime = startOfDay;

    for (const busyPeriod of busy) {
      const busyStart = new Date(busyPeriod.start);
      
      if (currentTime < busyStart) {
        const slotDuration = (busyStart - currentTime) / (1000 * 60);
        if (slotDuration >= duration) {
          freeSlots.push({
            start: new Date(currentTime),
            end: new Date(busyStart)
          });
        }
      }
      
      currentTime = new Date(busyPeriod.end);
    }

    if (currentTime < endOfDay) {
      const slotDuration = (endOfDay - currentTime) / (1000 * 60);
      if (slotDuration >= duration) {
        freeSlots.push({
          start: new Date(currentTime),
          end: new Date(endOfDay)
        });
      }
    }

    if (freeSlots.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📅 No free slots of ${duration} minutes found on ${date}`
        }]
      };
    }

    let output = `📅 **Free Slots on ${new Date(date).toLocaleDateString()}** (${duration}+ min)\n\n`;
    freeSlots.forEach((slot, i) => {
      output += `${i + 1}. ${slot.start.toLocaleTimeString()} - ${slot.end.toLocaleTimeString()}\n`;
    });

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to find free slots: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function deleteEvent(eventId) {
  try {
    const auth = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    return {
      content: [{
        type: "text",
        text: `✅ Event deleted successfully!`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to delete event: ${error.message}`
      }],
      isError: true
    };
  }
}
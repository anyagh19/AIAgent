import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs/promises';
import path from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];
const TOKEN_PATH = path.join(process.cwd(), 'tokens', 'gmail-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials', 'gmail-credentials.json');

let cachedAuth = null;

async function getAuthClient() {
  if (cachedAuth) return cachedAuth;

  try {
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
    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    
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

export async function searchEmails(query, maxResults = 10) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults,
    });

    if (!response.data.messages || response.data.messages.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📧 No emails found matching: "${query}"`
        }]
      };
    }

    let output = `📧 **Found ${response.data.messages.length} emails**\n\n`;

    for (const message of response.data.messages.slice(0, 5)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = detail.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      output += `📨 **${subject}**\n`;
      output += `From: ${from}\n`;
      output += `Date: ${date}\n`;
      output += `ID: ${message.id}\n\n`;
    }

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
        text: `❌ Email search error: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getUnreadEmails(maxResults = 10) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: maxResults,
    });

    if (!response.data.messages || response.data.messages.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📧 No unread emails! Inbox Zero achieved! 🎉`
        }]
      };
    }

    let output = `📧 **${response.data.messages.length} Unread Emails**\n\n`;

    for (const message of response.data.messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = detail.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      output += `📨 **${subject}**\n`;
      output += `From: ${from}\n`;
      output += `Date: ${date}\n\n`;
    }

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
        text: `❌ Failed to get unread emails: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getEmailContent(emailId) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full'
    });

    const headers = message.data.payload.headers;
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    let body = '';
    
    function getBody(payload) {
      if (payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain') {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      }
      return 'Could not extract email body';
    }

    body = getBody(message.data.payload);

    let output = `📧 **Email Details**\n\n`;
    output += `**Subject:** ${subject}\n`;
    output += `**From:** ${from}\n`;
    output += `**Date:** ${date}\n\n`;
    output += `**Body:**\n${body.substring(0, 1000)}${body.length > 1000 ? '...' : ''}`;

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
        text: `❌ Failed to get email content: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function markAsRead(emailId) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      resource: {
        removeLabelIds: ['UNREAD']
      }
    });

    return {
      content: [{
        type: "text",
        text: `✅ Email marked as read`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to mark as read: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function sendEmail(to, subject, body) {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');

    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      resource: {
        raw: encodedEmail
      }
    });

    return {
      content: [{
        type: "text",
        text: `✅ Email sent to ${to}!\n\nSubject: ${subject}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to send email: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getEmailStats() {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const [unreadResponse, totalResponse, todayResponse] = await Promise.all([
      gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 1 }),
      gmail.users.messages.list({ userId: 'me', maxResults: 1 }),
      gmail.users.messages.list({ 
        userId: 'me', 
        q: `after:${Math.floor(Date.now() / 1000) - 86400}`,
        maxResults: 1 
      })
    ]);

    const unread = unreadResponse.data.resultSizeEstimate || 0;
    const total = totalResponse.data.resultSizeEstimate || 0;
    const today = todayResponse.data.resultSizeEstimate || 0;

    let output = `📊 **Email Statistics**\n\n`;
    output += `📧 Total Emails: ${total}\n`;
    output += `📨 Unread: ${unread}\n`;
    output += `📅 Received Today: ${today}\n`;
    output += `✅ Read: ${total - unread}`;

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
        text: `❌ Failed to get email stats: ${error.message}`
      }],
      isError: true
    };
  }
}
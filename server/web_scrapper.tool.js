// web_scrapper.tool.js
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

let monitoredPages = {}; // url -> { lastContent, interval }

export async function scrapePage(url, selector = 'body') {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    const content = $(selector).text().trim();
    return {
      content: [{ type: 'text', text: `🌐 Scraped ${url}\n\n${content.slice(0, 2000)}` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Scrape error: ${error.message}` }], isError: true };
  }
}

export async function monitorChanges(url, intervalMinutes = 60, selector = 'body') {
  try {
    // Store monitoring info
    monitoredPages[url] = { interval: intervalMinutes, selector, lastContent: '' };
    // Immediately run first check
    await checkPage(url);
    // Schedule periodic checks (you'd use node-cron or setInterval in a real server)
    // For now, just acknowledge
    return {
      content: [{ type: 'text', text: `👀 Monitoring ${url} every ${intervalMinutes} minutes.` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Monitor error: ${error.message}` }], isError: true };
  }
}

async function checkPage(url) {
  // Internal function to check and notify if changed
  // We'll implement minimal version
  const info = monitoredPages[url];
  if (!info) return;
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    const content = $(info.selector).text().trim();
    if (info.lastContent && content !== info.lastContent) {
      console.log(`🔔 Change detected on ${url}`);
      // Here you could send a notification via email or WhatsApp
    }
    info.lastContent = content;
  } catch (err) {
    console.error(`Monitor check error for ${url}:`, err);
  }
}

export async function extractStructuredData(url, selector) {
  // Similar to scrapePage but returns structured data (e.g., list of items)
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    const elements = $(selector);
    const data = elements.map((i, el) => $(el).text().trim()).get();
    return {
      content: [{ type: 'text', text: `📊 Extracted data:\n${data.join('\n')}` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Extraction error: ${error.message}` }], isError: true };
  }
}
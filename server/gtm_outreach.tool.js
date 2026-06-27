// gtm_outreach.tool.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scrapePage } from './web_scrapper.tool.js';
import { notify } from './desktop_notification.tool.js';
import fs from 'fs/promises';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const DATA_DIR = path.join(process.cwd(), 'data');
const OUTREACH_FILE = path.join(DATA_DIR, 'gtm_outreach_results.json');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ── Helper: call Gemini with JSON response ──────────────────
async function callGemini(prompt, responseMimeType = 'application/json') {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType },
  });
  return result.response.text();
}

// ── 1. Company Finder Agent ──────────────────────────────────
async function findCompanies(targetDesc, offeringDesc, maxCompanies) {
  const prompt = `
You are a B2B company finder. Given a target description and an offering, find ${maxCompanies} companies that are a strong fit.

Target: ${targetDesc}
Offering: ${offeringDesc}

Return JSON with key "companies" as a list of objects: { name, website, why_fit (1-2 lines) }.
Only return valid JSON.
`;
  const text = await callGemini(prompt);
  try {
    const data = JSON.parse(text);
    return data.companies || [];
  } catch {
    console.warn('Failed to parse companies, using fallback.');
    return [];
  }
}

// ── 2. Contact Finder Agent ──────────────────────────────────
async function findContacts(companies, targetDesc, offeringDesc) {
  const prompt = `
You are a B2B contact finder. For each company below, find 2-3 relevant decision makers and their emails if available.
Prioritise: Founder's Office, GTM (Marketing/Growth), Sales leadership, Partnerships/Business Development, Product Marketing.
If direct emails not found, infer likely email (e.g., first.last@domain) and mark inferred=true.

Target: ${targetDesc}
Offering: ${offeringDesc}
Companies JSON: ${JSON.stringify(companies, null, 2)}

Return JSON with key "companies" as a list, each with: name, contacts: [{ full_name, title, email, inferred }].
Only return valid JSON.
`;
  const text = await callGemini(prompt);
  try {
    const data = JSON.parse(text);
    return data.companies || [];
  } catch {
    console.warn('Failed to parse contacts, using fallback.');
    return [];
  }
}

// ── 3. Researcher Agent ──────────────────────────────────────
async function researchCompanies(companies) {
  const prompt = `
You are a researcher. For each company, gather 2-4 interesting, non-generic insights from their website and Reddit discussions that would help personalise outreach.

Companies JSON: ${JSON.stringify(companies, null, 2)}

Insights should be specific (e.g., recent funding, product launches, company culture, Reddit sentiment).
Return JSON with key "companies" as a list, each with: name, insights: [string, ...].
Only return valid JSON.
`;
  const text = await callGemini(prompt);
  try {
    const data = JSON.parse(text);
    return data.companies || [];
  } catch {
    console.warn('Failed to parse research, using fallback.');
    return [];
  }
}

// ── 4. Email Writer Agent ────────────────────────────────────
async function writeEmails(contactsData, researchData, offeringDesc, senderName, senderCompany, calendarLink, style) {
  const styleMap = {
    Professional: 'Professional. Clear, respectful, and businesslike. Short paragraphs; no slang.',
    Casual: 'Casual. Friendly, approachable, first-name basis. No slang or emojis; keep it human.',
    Cold: 'Cold email. Strong hook in opening 2 lines, tight value proposition, minimal fluff, strong CTA.',
    Consultative: 'Consultative. Insight-led, frames observed problems and tailored solution hypotheses; soft CTA.',
  };
  const styleInstruction = styleMap[style] || styleMap.Professional;

  const prompt = `
You are an email writer. Write personalised B2B outreach emails for the following contacts.

Sender: ${senderName} at ${senderCompany}
Offering: ${offeringDesc}
Calendar link: ${calendarLink || 'N/A'}
Style: ${styleInstruction}

Contacts JSON: ${JSON.stringify(contactsData, null, 2)}
Research JSON: ${JSON.stringify(researchData, null, 2)}

Email length: 120-160 words.
Include 1-2 lines of strong personalisation referencing research insights.
CTA: suggest a short intro call.
Return JSON with key "emails" as a list of { company, contact, subject, body }.
Only return valid JSON.
`;
  const text = await callGemini(prompt);
  try {
    const data = JSON.parse(text);
    return data.emails || [];
  } catch {
    console.warn('Failed to parse emails, using fallback.');
    return [];
  }
}

// ── 5. Main Orchestrator ─────────────────────────────────────
export async function runGTMOutreach({
  targetDesc,
  offeringDesc,
  senderName = 'Sales Team',
  senderCompany = 'Our Company',
  calendarLink = '',
  numCompanies = 5,
  emailStyle = 'Professional',
  saveResults = true,
}) {
  try {
    await ensureDir();

    // Step 1: Find companies
    const companies = await findCompanies(targetDesc, offeringDesc, numCompanies);
    if (!companies.length) {
      return { content: [{ type: 'text', text: '❌ No companies found.' }], isError: true };
    }

    // Step 2: Find contacts
    const contactsData = await findContacts(companies, targetDesc, offeringDesc);

    // Step 3: Research insights
    const researchData = await researchCompanies(companies);

    // Step 4: Write emails
    const emails = await writeEmails(
      contactsData,
      researchData,
      offeringDesc,
      senderName,
      senderCompany,
      calendarLink,
      emailStyle
    );

    // Assemble results
    const results = { companies, contacts: contactsData, research: researchData, emails };

    if (saveResults) {
      await fs.writeFile(OUTREACH_FILE, JSON.stringify(results, null, 2));
    }

    await notify('📧 GTM Outreach Complete', `Found ${companies.length} companies, ${emails.length} emails generated.`);

    // Build text response
    let text = `✅ **GTM Outreach Results**\n\n`;
    text += `**Companies (${companies.length})**\n`;
    companies.forEach((c, i) => {
      text += `${i+1}. **${c.name}** – ${c.website || ''}\n`;
      text += `   Fit: ${c.why_fit || ''}\n`;
    });
    text += '\n**Contacts**\n';
    contactsData.forEach(c => {
      text += `**${c.name}**\n`;
      c.contacts?.forEach(p => {
        const inferred = p.inferred ? ' (inferred)' : '';
        text += `   - ${p.full_name} | ${p.title} | ${p.email || 'N/A'}${inferred}\n`;
      });
    });
    text += '\n**Research Insights**\n';
    researchData.forEach(r => {
      text += `**${r.name}**\n`;
      r.insights?.forEach(i => text += `   - ${i}\n`);
    });
    text += '\n**Emails**\n';
    emails.forEach((e, i) => {
      text += `\n${i+1}. **${e.company} → ${e.contact}**\n`;
      text += `   Subject: ${e.subject}\n`;
      text += `   ${e.body}\n`;
    });

    return {
      content: [{ type: 'text', text }],
      metadata: { results, filePath: saveResults ? OUTREACH_FILE : null },
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `❌ Error: ${error.message}` }],
      isError: true,
    };
  }
}
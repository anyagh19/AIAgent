// youtube_summarizer.tool.js
import youtubeTranscript from 'youtube-transcript-api';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';
import { notify } from './desktop_notification.tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OUTPUT_DIR = path.join(process.cwd(), 'user_files', 'youtube_summaries');

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

// ── Get video title via YouTube API (optional fallback) ──
async function getVideoTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await res.text();
    const match = html.match(/<title>(.*?) - YouTube<\/title>/);
    return match ? match[1] : 'YouTube Video';
  } catch {
    return 'YouTube Video';
  }
}

// ── Fetch transcript ──
async function fetchTranscript(videoUrl) {
  const url = new URL(videoUrl);
  const videoId = url.searchParams.get('v') || url.pathname.split('/').pop();
  if (!videoId) throw new Error('Invalid YouTube URL.');

  try {
    const transcriptData = await youtubeTranscript.getTranscript(videoId);
    const text = transcriptData.map(item => item.text).join(' ');
    const title = await getVideoTitle(videoId);
    return { transcript: text, videoTitle: title, videoId };
  } catch (error) {
    throw new Error(`No transcript available: ${error.message}`);
  }
}

// ── Summarize with Gemini ──
async function summarizeTranscript(transcript) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `Summarize the following YouTube video transcript in a concise, well-structured summary (bullet points or paragraphs). Include key points, main ideas, and any important conclusions. Keep it under 500 words.\n\nTranscript:\n${transcript.slice(0, 10000)}`;
  const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  return result.response.text();
}

// ── Create PDF ──
async function createPDF(summary, videoTitle) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont('Helvetica');
  const fontSize = 12;
  const margin = 40;
  let y = height - margin;
  const lines = summary.split('\n');

  for (const line of lines) {
    if (y < margin) {
      const newPage = pdfDoc.addPage([600, 800]);
      y = height - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font });
    y -= fontSize * 1.5;
  }

  const pdfBytes = await pdfDoc.save();
  const fileName = `${videoTitle.replace(/[^a-zA-Z0-9]/g, '_')}_summary.pdf`;
  const pdfPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(pdfPath, pdfBytes);
  return pdfPath;
}

// ── Main tool ──
export async function summarizeYouTubeVideo(videoUrl, email = null) {
  try {
    await ensureOutputDir();
    const { transcript, videoTitle } = await fetchTranscript(videoUrl);
    const summary = await summarizeTranscript(transcript);
    const pdfPath = await createPDF(summary, videoTitle);

    if (email) {
      const { sendEmailViaGmail } = await import('./email.tool.js');
      await sendEmailViaGmail(email, `YouTube Summary: ${videoTitle}`, summary);
    }

    await notify('📹 YouTube Summary', `Summary for "${videoTitle}" generated.`);

    return {
      content: [
        { type: 'text', text: `✅ Summary for "${videoTitle}" generated.\n📄 PDF: ${pdfPath}\n\n📝 Summary:\n${summary}` }
      ]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}
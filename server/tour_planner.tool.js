// tour_planner.tool.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scrapePage } from './web_scrapper.tool.js';
import { notify } from './desktop_notification.tool.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const OUTPUT_DIR = path.join(process.cwd(), 'user_files', 'tours');

async function ensureDir() { await fs.mkdir(OUTPUT_DIR, { recursive: true }); }

// ── 1. Planner Agent ──────────────────────────────────────────
async function planTour(location, interests, durationMinutes) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `
You are a tour planner. Given a location, user interests, and total duration, allocate time (in minutes) among introduction, conclusion, and each interest category.

Interests: ${interests.join(', ')}
Location: ${location}
Total Duration: ${durationMinutes} minutes

Rules:
- Reserve ~1 minute for introduction and ~1 minute for conclusion.
- Distribute remaining time according to interest weight (higher interest → more time).
- Ensure each category gets at least 1 minute (or 2 if duration > 30 min).
- Return JSON with keys: introduction, architecture, history, culture, culinary, conclusion.
- Only the JSON, no other text.

Example output:
{
  "introduction": 1.5,
  "architecture": 8,
  "history": 10,
  "culture": 5,
  "culinary": 4.5,
  "conclusion": 1
}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  return JSON.parse(result.response.text());
}

// ── 2. Specialist Agents ──────────────────────────────────────
async function generateSection(location, interests, wordLimit, sectionType) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const instructions = {
    architecture: `
You are an Architecture expert. Describe architectural styles, notable buildings, urban planning, and design elements for an audio tour.
- Be conversational and descriptive, as if guiding a person walking.
- Focus on visual details, interesting facts, and what to look for.
- Word limit: ${wordLimit}–${wordLimit + 20} words.
- Return only the content (no headings or formatting).`,
    history: `
You are a History expert. Provide historically accurate, engaging stories about landmarks and events for an audio tour.
- Make history come alive with narratives and little‑known facts.
- Conversational, professorial tone.
- Word limit: ${wordLimit}–${wordLimit + 20} words.
- Return only the content.`,
    culture: `
You are a Culture expert. Highlight local traditions, arts, music, and cultural practices for an audio tour.
- Warm, respectful, immersive tone.
- Include specific cultural venues, events, and nuances.
- Word limit: ${wordLimit}–${wordLimit + 20} words.
- Return only the content.`,
    culinary: `
You are a Culinary expert. Describe local food specialties, restaurants, markets, and culinary traditions for an audio tour.
- Enthusiastic, vivid descriptions; make it appetizing.
- Include practical tips (operating hours, price range).
- Word limit: ${wordLimit}–${wordLimit + 20} words.
- Return only the content.`,
  };

  const prompt = `
Location: ${location}
User interests: ${interests.join(', ')}

${instructions[sectionType]}

Use web search if you need current info (but do not cite sources).
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return result.response.text();
}

// ── 3. Orchestrator Agent ─────────────────────────────────────
async function orchestrateTour(location, interests, duration, sections) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const interestSections = interests.map(i => {
    const key = i.toLowerCase();
    return sections[key] || '';
  }).filter(Boolean).join('\n\n');

  const prompt = `
You are an orchestrator for a self‑guided audio tour. Combine the provided content sections into a cohesive, flowing tour script.

Location: ${location}
Total Duration: ${duration} minutes
Selected Interests: ${interests.join(', ')}

Content Sections:
${interestSections}

Your tasks:
1. Write a warm, engaging introduction (1‑2 sentences) welcoming the visitor.
2. Arrange the sections in the order: Architecture → History → Culture → Culinary (only those that exist).
3. Add natural transitions between sections to connect themes.
4. Write a short, thoughtful conclusion.
5. Ensure the entire script is conversational, as if a guide is walking with the visitor.

Return the full tour as a single string with no markdown headings. It should sound like one continuous narrative.
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return result.response.text();
}

// ── 4. Text‑to‑Speech (optional) ─────────────────────────────
async function textToSpeech(text, outputFile = 'tour.mp3') {
  const filePath = path.join(OUTPUT_DIR, outputFile);
  // Try OpenAI TTS if API key exists
  if (process.env.OPENAI_API_KEY) {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      instructions: 'Speak naturally as a friendly tour guide.',
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  // Fallback: use system TTS (say on macOS, espeak on Linux)
  let cmd;
  const platform = process.platform;
  if (platform === 'darwin') {
    const tempFile = path.join(OUTPUT_DIR, 'temp_audio.wav');
    cmd = `say -o "${tempFile}" --file-format=WAVE --data-format=LEI16@44100 "${text}" && ffmpeg -i "${tempFile}" "${filePath}" -y`;
    // Requires ffmpeg installed
    await execAsync(cmd);
    await fs.unlink(tempFile).catch(() => {});
  } else if (platform === 'linux') {
    // use espeak
    cmd = `espeak -w "${filePath}" "${text}"`;
    await execAsync(cmd);
  } else {
    throw new Error('TTS not supported on this platform without OpenAI key.');
  }
  return filePath;
}

// ── 5. Main Export ─────────────────────────────────────────────
export async function generateAudioTour({
  location,
  interests = ['History', 'Architecture'],
  durationMinutes = 10,
  generateAudio = false,
}) {
  try {
    await ensureDir();

    // Step 1: Plan time allocation
    const plan = await planTour(location, interests, durationMinutes);
    const wordRate = 150; // words per minute average speaking
    const sections = {};

    // Step 2: Generate each interest section with its word limit
    for (const interest of interests) {
      const key = interest.toLowerCase();
      const time = plan[key] || 2;
      const wordLimit = Math.round(time * wordRate);
      const content = await generateSection(location, interests, wordLimit, key);
      sections[key] = content;
    }

    // Step 3: Orchestrate final tour
    const finalTour = await orchestrateTour(location, interests, durationMinutes, sections);

    // Step 4: Save tour to file
    const fileName = `${location.replace(/\s/g, '_')}_${Date.now()}.txt`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.writeFile(filePath, finalTour);

    let audioPath = null;
    if (generateAudio) {
      try {
        audioPath = await textToSpeech(finalTour, `${location.replace(/\s/g, '_')}_tour.mp3`);
      } catch (err) {
        console.warn('TTS generation failed:', err.message);
      }
    }

    await notify('🎧 Audio Tour Generated', `Tour for ${location} is ready.`);

    let responseText = `✅ **Audio Tour for ${location}**\n\n📄 Script saved: ${filePath}`;
    if (audioPath) {
      responseText += `\n🎵 Audio file: ${audioPath}`;
    }
    responseText += `\n\n${finalTour}`;

    return {
      content: [{ type: 'text', text: responseText }],
      metadata: { scriptPath: filePath, audioPath },
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `❌ Error: ${error.message}` }],
      isError: true,
    };
  }
}
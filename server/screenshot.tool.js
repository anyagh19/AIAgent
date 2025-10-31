// screenshot.tool.js
import screenshot from "screenshot-desktop";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import "dotenv/config";

const SCREENSHOT_PATH = path.join(process.cwd(), "screenshot.jpg");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Takes a screenshot and saves it locally.
 */
export async function takeScreenshot() {
  const img = await screenshot({ format: "jpg" });
  fs.writeFileSync(SCREENSHOT_PATH, img);
  return SCREENSHOT_PATH;
}

/**
 * Captures a screenshot and analyzes it using OpenAI Vision (GPT-4o-mini).
 */
export async function analyzeScreenshot() {
  try {
    // 1️⃣ Take screenshot
    const filePath = await takeScreenshot();
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString("base64");

    // 2️⃣ Send image + text to OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // supports image + text
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this screenshot and briefly describe what’s visible." },
            { 
              type: "image_url", 
              image_url: { url: `data:image/jpeg;base64,${base64Image}` } // ✅ FIXED STRUCTURE
            },
          ],
        },
      ],
    });

    const text = completion.choices[0].message.content;

    return {
      success: true,
      report: text,
      imagePath: filePath,
    };
  } catch (error) {
    console.error("OpenAI Vision Error:", error);
    return { success: false, error: error.message };
  }
}

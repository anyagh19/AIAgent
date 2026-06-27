// advanced_travel_planner.tool.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scrapePage } from './web_scrapper.tool.js';
// import { navigateAndSearch } from './index.js'; // if you want to open tabs
import { notify } from './desktop_notification.tool.js';
import fs from 'fs/promises';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const OUTPUT_DIR = path.join(process.cwd(), 'user_files', 'itineraries');

async function ensureDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

// ── Helper: fetch weather (simulated, you can use a real API) ──
async function fetchWeather(city, days = 7) {
  // In real use, call OpenWeatherMap or similar
  return `Sunny, 22°C to 28°C, with light breeze.`;
}

// ── Helper: fetch attractions (simulated) ──
async function fetchAttractions(city) {
  // Could scrape or use Google Places API
  return [
    { name: 'City Center', description: 'Main square with shops and cafes.', address: '123 Main St' },
    { name: 'Local Museum', description: 'History and culture exhibits.', address: '456 Museum Rd' },
  ];
}

// ── Helper: fetch accommodation (simulated) ──
async function fetchAccommodation(city, budget) {
  return [
    { name: 'Luxury Hotel', price: 200, rating: 4.8, address: '789 Luxury Ave' },
    { name: 'Budget Hostel', price: 50, rating: 4.2, address: '101 Budget Ln' },
    { name: 'Airbnb Villa', price: 150, rating: 4.6, address: '202 Villa St' },
  ];
}

// ── Generate detailed itinerary using Gemini ──
async function generateDetailedItinerary(
  destination,
  numDays,
  preferences,
  budget,
  startDate
) {
  // Fetch real-time data
  const weather = await fetchWeather(destination);
  const attractions = await fetchAttractions(destination);
  const accommodations = await fetchAccommodation(destination, budget);

  const prompt = `
You are a professional travel consultant. Create an extremely detailed day‑by‑day itinerary for ${destination} for ${numDays} days, starting ${startDate}.

**Budget:** $${budget} USD total
**Preferences:** ${preferences || 'General sightseeing'}

**REAL-TIME DATA (use this information):**
- Weather forecast: ${weather}
- Attractions: ${JSON.stringify(attractions, null, 2)}
- Accommodation options: ${JSON.stringify(accommodations, null, 2)}

**REQUIRED OUTPUT STRUCTURE:**
1. **Trip Overview** – summary, total estimated cost breakdown, weather overview.
2. **Accommodation Recommendations** – pick 1-2 options from above with justifications.
3. **Transportation Overview** – options (car rental, public transport, taxis) with approximate costs.
4. **Day-by-Day Itinerary** – for each day:
   - Morning, Afternoon, Evening activities with specific times.
   - Locations with addresses, opening hours, ticket prices.
   - Distance and travel time between locations (estimated).
   - Estimated cost for each activity and transportation.
   - Buffers for meals and rest.
5. **Dining Plan** – recommended restaurants (type, price range, location).
6. **Practical Information** – currency, language, safety tips, packing list, local customs.

Be extremely specific. Use the provided real-time data. If information is missing, make reasonable assumptions and state them.

Generate the complete itinerary in Markdown.
`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return result.response.text();
}

// ── Main export ──
export async function planDetailedTrip({
  destination,
  numDays = 7,
  preferences = '',
  budget = 2000,
  startDate = new Date().toISOString().split('T')[0],
  email = null,
}) {
  try {
    await ensureDir();
    const itinerary = await generateDetailedItinerary(
      destination,
      numDays,
      preferences,
      budget,
      startDate
    );

    // Save to file
    const fileName = `${destination.replace(/\s/g, '_')}_${startDate}.md`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.writeFile(filePath, itinerary);

    // Optionally email
    if (email) {
      const { sendEmailViaGmail } = await import('./email.tool.js');
      await sendEmailViaGmail(email, `Detailed Trip Itinerary: ${destination}`, itinerary);
    }

    await notify('✈️ Detailed Itinerary', `Itinerary for ${destination} generated.`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Detailed Itinerary for ${destination}**\n\n📄 Saved to: ${filePath}\n\n${itinerary}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `❌ Error: ${error.message}` }],
      isError: true,
    };
  }
}
// /api/events.js
// Vercel Serverless Function (Node.js runtime)
//
// Fetches REAL, current local events for any city on earth by asking
// Claude (Anthropic API) to search the live web and return structured JSON.
// The API key stays server-side — never exposed to the browser.
//
// Requires an environment variable on Vercel:
//   ANTHROPIC_API_KEY = sk-ant-...
//
// Call from the frontend like:
//   GET /api/events?city=Düsseldorf

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are the backend data engine for "Scout AI", a local event discovery app.
You have a web_search tool. Use it to find REAL events, pop-ups, parties, exhibitions,
markets, restaurant openings, concerts and community happenings in the given city that are
either happening now or in the next 14 days.

Rules:
- Only include events you actually found evidence for via search. Never invent an event.
- If you can't find enough real events, return fewer — quality and truthfulness over quantity.
- Prefer official sources, city tourism sites, event listing platforms, and local press.
- Write "description" and "ai_hook" in German if the city is in a German-speaking country,
  otherwise in English.
- Respond with ONLY raw JSON. No markdown fences, no commentary, no preamble.

JSON schema to return:
{
  "events": [
    {
      "title": string,
      "description": string,           // 1-2 sentences, factual
      "ai_hook": string,                // 1 short sentence: why this is worth not missing
      "category": "gastro" | "party" | "culture" | "community" | "tech_talk" | "other",
      "start_time": string,             // best-guess ISO 8601 datetime
      "venue_name": string,
      "address": string,
      "latitude": number,
      "longitude": number,
      "is_free": boolean,
      "price_descriptor": string,       // e.g. "Kostenlos", "12€", "from $15"
      "fomo_score": number,             // 1-10, how unique/time-limited this is
      "source_url": string              // a real URL returned by search
    }
  ]
}`;

function extractJson(text) {
  const trimmed = text.trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw e;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const city = (req.query.city || "").toString().trim().slice(0, 80);
  if (!city) {
    return res.status(400).json({ error: "Bitte eine Stadt angeben (?city=...)." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY ist auf dem Server nicht gesetzt.",
      hint: "In Vercel: Project Settings → Environment Variables → ANTHROPIC_API_KEY hinzufügen, dann neu deployen.",
    });
  }

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content: `Finde echte, aktuelle Veranstaltungen, Pop-ups, Partys, Ausstellungen, Märkte und Gastro-Neueröffnungen in "${city}" für die nächsten 14 Tage. Nutze die Websuche und gib 6-10 Events als JSON zurück.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Anthropic API Fehler", detail: errText });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    let parsed;
    try {
      parsed = extractJson(text);
    } catch (e) {
      return res.status(502).json({
        error: "Konnte die KI-Antwort nicht als JSON parsen.",
        raw: text.slice(0, 2000),
      });
    }

    const events = Array.isArray(parsed.events) ? parsed.events : [];

    return res.status(200).json({
      city,
      generated_at: new Date().toISOString(),
      count: events.length,
      events,
    });
  } catch (err) {
    return res.status(500).json({ error: "Unerwarteter Serverfehler", detail: String(err) });
  }
}

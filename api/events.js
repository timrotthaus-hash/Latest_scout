// /api/events.js
// Vercel Serverless Function (Node.js runtime)
// Uses Google Gemini 1.5 API with Google Search Grounding for LIVE web searching of any city worldwide.

const GEMINI_MODEL = "gemini-1.5-flash";

const SYSTEM_PROMPT = `Du bist die Backend Engine für "Scout AI" (Anti-FOMO Event Discovery).
Deine Aufgabe: Nutze die Google-Websuche, um ECHTE, aktuell angekündigte Veranstaltungen, Pop-ups, Partys, Ausstellungen, Märkte und Gastro-Neueröffnungen in der eingegebenen Stadt für die nächsten 14 Tage zu finden.

Regeln:
- Nur echte Events aus der Websuche verwenden. Keine erfundenen Daten.
- "source_url": ZWINGEND die ECHTE, direkte Quell-URL aus den Suchergebnissen verwenden (z.B. Instagram-Post Link, Resident Advisor Event, Eventbrite, Ticketmaster oder offizielle Veranstalter-Website). Niemals Platzhalter oder allgemeine Startseiten.
- Generiere für jedes Event eine prägnante "ai_hook" auf Deutsch (1 Satz: Warum lohnt sich das Event?).
- Gib AUSSCHLIESSLICH ein valides JSON im folgenden Format zurück:

{
  "events": [
    {
      "title": "Exakter Name des Events",
      "description": "Faktische 1-2 Sätze Zusammenfassung",
      "ai_hook": "Warum man dieses Event nicht verpassen sollte",
      "category": "gastro" | "party" | "culture" | "community" | "tech_talk" | "other",
      "start_time": "2026-08-15T18:00:00Z",
      "venue_name": "Location Name",
      "address": "Straße, Stadt",
      "latitude": 51.2277,
      "longitude": 6.7735,
      "is_free": false,
      "price_descriptor": "z. B. 12€ oder Kostenlos",
      "fomo_score": 9,
      "source_url": "https://instagram.com/p/... oder https://ra.co/events/... oder offizielle Event-URL"
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

  const city = (req.query.city || "Düsseldorf").toString().trim().slice(0, 80);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY ist auf Vercel noch nicht eingetragen.",
      hint: "Gehe bei Vercel auf Settings -> Environment Variables -> füge GEMINI_API_KEY hinzu."
    });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    // Request with Google Search Grounding Tool enabled
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nFühre eine Websuche durch und finde 5-10 aktuelle, echte Events in "${city}".` }
            ]
          }
        ],
        tools: [
          {
            google_search: {}  // Enables Google Search Grounding for Live Search!
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      let parsed;
      try {
        parsed = extractJson(text);
      } catch (e) {
        parsed = { events: [] };
      }

      const events = Array.isArray(parsed.events) ? parsed.events : [];
      if (events.length > 0) {
        return res.status(200).json({
          city,
          provider: "Google Gemini 1.5 Live Search Engine",
          generated_at: new Date().toISOString(),
          count: events.length,
          events,
        });
      }
    } else {
      const errBody = await response.text();
      return res.status(502).json({ error: "Gemini Live Search Fehler", detail: errBody });
    }
  } catch (err) {
    return res.status(500).json({ error: "Serverfehler beim Abruf", detail: String(err) });
  }

  return res.status(404).json({ error: `Keine aktuellen Live-Events für "${city}" gefunden.` });
}

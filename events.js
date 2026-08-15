// /api/events.js
// Vercel Serverless Function (Node.js runtime)
// Uses Google Gemini API with Google Search Grounding for LIVE web searching of any city worldwide.
import crypto from "crypto";

const GEMINI_MODEL = "gemini-1.5-flash";

const SYSTEM_PROMPT = `Du bist die Backend Engine für "Scout AI" (Anti-FOMO Event Discovery).
Deine Aufgabe: Nutze die Google-Websuche, um ECHTE, aktuell angekündigte Veranstaltungen, Pop-ups, Partys, Ausstellungen, Märkte, Streetfood-Spots und Gastro-Neueröffnungen in der angegebenen Stadt für die nächsten 14 Tage zu finden.

Regeln:
- Nur echte Events aus der Websuche verwenden. Keine erfundenen Daten.
- "source_url": ZWINGEND die ECHTE, direkte Quell-URL aus den Suchergebnissen verwenden (z.B. Instagram-Post Link, Resident Advisor Event, Eventbrite, Ticketmaster oder offizielle Veranstalter-Website). Niemals Platzhalter oder allgemeine Startseiten.
- Generiere für jedes Event eine prägnante "ai_hook" auf Deutsch (1 Satz: Warum lohnt sich das Event?).
- "category": Zwingend eine von: 'Neueröffnung' | 'Festival & Open Air' | 'Food & Drinks' | 'Kultur & Flohmarkt' | 'Outdoor' | 'Party' | 'Gastro' | 'Kultur'.
- Gib AUSSCHLIESSLICH ein valides JSON im folgenden Format zurück:

{
  "events": [
    {
      "title": "Exakter Name des Events",
      "category": "Party",
      "description": "Faktische 1-2 Sätze Zusammenfassung der Highlights",
      "ai_hook": "Warum man dieses Event nicht verpassen sollte",
      "date_info": "16.08.2026",
      "time_info": "18:00 Uhr",
      "start_time": "2026-08-16T18:00:00Z",
      "location_name": "Location Name",
      "address": "Straße, Stadt",
      "lat": 51.2277,
      "lon": 6.7735,
      "is_free": true,
      "price_info": "Kostenlos oder 12€",
      "fomo_score": 9,
      "source_url": "https://..."
    }
  ]
}`;

function calculateMD5(input) {
  return crypto.createHash("md5").update(input || "").digest("hex");
}

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
    
    // Request with Google Search Grounding Tool enabled and retry logic
    const maxRetries = 2;
    let attempt = 0;
    let response;
    while (attempt <= maxRetries) {
      try {
        response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${SYSTEM_PROMPT}\n\nFühre eine Websuche durch und finde 6-10 aktuelle, echte Events in "${city}".` }
                ]
              }
            ],
            tools: [
              {
                google_search: {} // Enables Google Search Grounding for Live Search!
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            }
          })
        });
        if (response.ok) break;
      } catch (e) {
        // Network or fetch retry
      }
      attempt++;
      if (attempt > maxRetries) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (response && response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      let parsed;
      try {
        parsed = extractJson(text);
      } catch (e) {
        parsed = { events: [] };
      }

      let events = Array.isArray(parsed.events) ? parsed.events : [];
      
      // Compute MD5 hash IDs and ensure lat/lon values
      events = events.map(ev => {
        const idSource = `${ev.title || ''}-${ev.date_info || ev.start_time || ''}-${ev.location_name || ev.address || ''}`;
        return {
          id: calculateMD5(idSource),
          title: ev.title || "Unbenanntes Event",
          category: ev.category || "Party",
          description: ev.description || "",
          ai_hook: ev.ai_hook || "Highlights & Vibes live vor Ort erleben.",
          date_info: ev.date_info || "Demnächst",
          time_info: ev.time_info || "TBA",
          start_time: ev.start_time || new Date().toISOString(),
          location_name: ev.location_name || city,
          address: ev.address || city,
          lat: ev.lat || ev.latitude || 51.2277,
          lon: ev.lon || ev.longitude || 6.7735,
          is_free: Boolean(ev.is_free),
          price_info: ev.price_info || ev.price_descriptor || (ev.is_free ? "Kostenlos" : "Ticket erforderlich"),
          fomo_score: Number(ev.fomo_score) || 8,
          source_url: ev.source_url || `https://www.google.com/search?q=${encodeURIComponent(city + " " + (ev.title || "Events"))}`
        };
      });

      if (events.length > 0) {
        return res.status(200).json({
          city,
          provider: "Google Gemini 1.5 Live Search Engine",
          generated_at: new Date().toISOString(),
          count: events.length,
          events
        });
      }
    } else if (response) {
      const errBody = await response.text();
      return res.status(502).json({ error: "Gemini Live Search Fehler", detail: errBody });
    }
  } catch (err) {
    return res.status(500).json({ error: "Serverfehler beim Abruf", detail: String(err) });
  }

  return res.status(404).json({ error: `Keine aktuellen Live-Events für "${city}" gefunden.` });
}

# Scout AI — Anti-FOMO Local Event Discovery

Findet echte, aktuelle Events für **jede Stadt weltweit**, live aus dem Internet — keine Fake-/Demo-Daten mehr.

## Wie es funktioniert

```
Browser (index.html)
   │  fetch("/api/events?city=Düsseldorf")
   ▼
Vercel Serverless Function (api/events.js)
   │  ruft Anthropic API auf, mit "web_search" Tool aktiviert
   ▼
Claude durchsucht live das Web nach echten Events in der Stadt
   │  gibt strukturiertes JSON zurück
   ▼
Browser rendert die Event-Karten
```

Der Anthropic API-Key liegt **nur auf dem Server** (Vercel Environment Variable) — er wird nie
an den Browser geschickt. Genau deshalb funktioniert das jetzt wirklich, im Gegensatz zum alten
Versuch, die API direkt aus dem Browser aufzurufen (CORS + Key-Leak-Problem).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Frontend: Stadt-Suche, Standort-Button, Kategorie-Filter, Event-Karten |
| `api/events.js` | Serverless Function: fragt Claude + Web-Suche nach echten Events, liefert JSON |
| `vercel.json` | Function-Konfiguration (Timeout 30s, da Web-Suche etwas dauert) |
| `package.json` | Markiert das Projekt als ES-Module (für `export default` in `api/events.js`) |
| `.env.example` | Vorlage für den benötigten API-Key |
| `legacy/` | Der ursprüngliche Prototyp (Streamlit + Docker + statische Demo-Seite) — bleibt als Referenz erhalten, wird aber von der neuen Website nicht mehr verwendet |

## Deployment (Vercel, kein eigener Server nötig)

1. **Anthropic API-Key besorgen**, falls noch nicht vorhanden: [console.anthropic.com](https://console.anthropic.com) → API Keys → neuen Key erstellen.
2. Diesen Ordner (ohne `legacy/`, das ist optional) als **GitHub-Repo** anlegen, oder direkt bei Vercel per Drag & Drop hochladen.
3. Bei [vercel.com](https://vercel.com) → **New Project** → Repo/Ordner auswählen.
4. Unter **Environment Variables**:
   - Name: `ANTHROPIC_API_KEY`
   - Wert: dein Key (beginnt mit `sk-ant-...`)
5. **Deploy** klicken. Fertig — die Seite ist live unter `https://dein-projekt.vercel.app`.

Änderst du später den API-Key oder den Code in `api/events.js`, musst du in Vercel einmal
**Redeploy** klicken (bzw. passiert automatisch bei jedem Git-Push).

## Lokal testen

```bash
npm install -g vercel
vercel dev
```

Vorher `.env.example` zu `.env` kopieren und deinen Key eintragen.

## Für Google Antigravity / Weiterentwicklung

Das ist ein normales, flaches Projekt (kein verschachteltes Framework-Setup) — Antigravity kann
den Ordner direkt als Projekt öffnen und weiterbauen. Sinnvolle nächste Schritte:

- **Caching**: Aktuell wird bei jeder Stadt-Suche neu gesucht (kostet Tokens & Zeit). Ein einfacher
  Cache (z. B. Vercel KV oder Upstash Redis, Key = Stadt, TTL = 2–6h) würde Kosten senken und die
  Antwortzeit auf wiederholte Suchen fast auf 0 bringen.
- **Echte Event-APIs zusätzlich einbinden**: Für höhere Trefferquote/Genauigkeit lassen sich
  Ticketmaster Discovery API, Eventbrite API oder Meetup API parallel zur Web-Suche abfragen und
  mit den KI-Ergebnissen zusammenführen/deduplizieren (die Dedup-Logik aus `legacy/app/services/deduplication.py`
  lässt sich dafür als Vorlage wiederverwenden, müsste aber nach JavaScript portiert werden).
- **Bilder**: Events haben aktuell farbige Icon-Banner statt Fotos (KI-Websuche liefert keine
  verlässlichen Bild-URLs). Optional: Unsplash API mit echtem Key für thematisch passende Fotos.
- **Speichern/Favoriten**: `localStorage`-basiertes Speichern von Events (wie im ursprünglichen
  Prototyp geplant) ist noch nicht eingebaut.
- **Rate-Limiting**: `api/events.js` hat aktuell kein Limit pro IP — bei öffentlichem Traffic
  sinnvoll ergänzen, damit niemand versehentlich das API-Budget leert.

## Bekannte Grenzen

- Die von Claude gefundenen Events sind so gut wie die Web-Suche an dem Tag — bei sehr kleinen
  Städten oder ungewöhnlichen Sprachen können weniger Treffer kommen. Das Backend gibt dann bewusst
  **weniger statt erfundene** Events zurück.
- Koordinaten (`latitude`/`longitude`) sind KI-Schätzungen, keine exakten Geodaten — für den
  "Route planen"-Button ausreichend, aber nicht pixelgenau.

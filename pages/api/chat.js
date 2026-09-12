export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').trim()
  const lastUserLower = lastUserMsg.toLowerCase()

  const weatherBlock = weatherData ? `\nLIVE WEATHER DATA (use this): ${weatherData}` : ''

  // ── Detect stock queries specifically ──
  const stockMatch = lastUserLower.match(/\b(tsla|tesla|apple|aapl|google|googl|amazon|amzn|meta|nvidia|nvda|microsoft|msft|netflix|nflx|bitcoin|btc|ethereum|eth)\b/) 
    || (lastUserLower.includes('stock') || lastUserLower.includes('share price') || lastUserLower.includes('trading at'))

  const needsSearch = /\b(news|today|tonight|right now|currently|live|score|standings|price|net worth|richer|richest|wealthiest|who won|latest|breaking|just happened|this week|this year|worth|billion|million|2025|2026)\b/.test(lastUserLower)

  let searchSnippet = ''
  let searchWorked = false

  // ── Stock price: use Yahoo Finance JSON API (free, no key) ──
  if (stockMatch) {
    const tickerMap = {
      tesla: 'TSLA', tsla: 'TSLA',
      apple: 'AAPL', aapl: 'AAPL',
      google: 'GOOGL', googl: 'GOOGL',
      amazon: 'AMZN', amzn: 'AMZN',
      meta: 'META',
      nvidia: 'NVDA', nvda: 'NVDA',
      microsoft: 'MSFT', msft: 'MSFT',
      netflix: 'NFLX', nflx: 'NFLX',
      bitcoin: 'BTC-USD', btc: 'BTC-USD',
      ethereum: 'ETH-USD', eth: 'ETH-USD',
    }
    const found = Object.keys(tickerMap).find(k => lastUserLower.includes(k))
    const ticker = found ? tickerMap[found] : null

    if (ticker) {
      try {
        const yahooRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
        )
        const yahooData = await yahooRes.json()
        const quote = yahooData?.chart?.result?.[0]?.meta
        if (quote) {
          const price = quote.regularMarketPrice
          const prev = quote.chartPreviousClose
          const change = price - prev
          const pct = ((change / prev) * 100).toFixed(2)
          const direction = change >= 0 ? 'up' : 'down'
          searchSnippet = `${ticker} current price: $${price.toFixed(2)}, ${direction} ${Math.abs(change).toFixed(2)} (${pct}%) from yesterday's close of $${prev.toFixed(2)}. Market: ${quote.marketState}.`
          searchWorked = true
        }
      } catch {}
    }
  }

  // ── General search: Jina + specific target pages ──
  if (!searchWorked && needsSearch) {
    try {
      const query = encodeURIComponent(lastUserMsg)
      // Target specific reliable pages via Jina instead of DDG HTML
      const targets = [
        `https://r.jina.ai/https://search.yahoo.com/search?p=${query}`,
      ]
      for (const url of targets) {
        const r = await fetch(url, {
          headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
          signal: AbortSignal.timeout(7000),
        })
        if (r.ok) {
          const text = await r.text()
          const cleaned = text.replace(/\s{3,}/g, ' ').trim().slice(0, 1000)
          if (cleaned.length > 150) {
            searchSnippet = cleaned
            searchWorked = true
            break
          }
        }
      }
    } catch {}
  }

  const systemPrompt = `Du bist STARK — ein lebendiger, freundlicher Deutsch-Gesprächspartner für einen A1-Lerner (gelegentlich A2). Du klingst wie ein echter Freund, nicht wie ein Lehrer mit Checkliste. Jede Antwort wird laut vorgelesen.

SPRACHE & STIL:
- Antworte AUSSCHLIESSLICH auf Deutsch. Immer. Egal was der Nutzer schreibt.
- A1-Niveau: kurze Sätze, häufige Wörter, Präsens bevorzugt. Kein kompliziertes Vokabular.
- Kein Markdown. Keine Sternchen, keine Aufzählungen, keine Überschriften. Nur natürliche gesprochene Sprache.
- Antworten kurz: 1-3 Sätze. Das Gespräch soll fließen, nicht stocken.

GESPRÄCHSFÜHRUNG — WICHTIGSTE REGEL:
- Du bist ein Gesprächspartner, kein Fragebogen. Stelle NIEMALS zwei Fragen hintereinander zum selben Thema. Eine Frage stellen, die Antwort abwarten, dann das Gespräch natürlich weiterführen.
- Wechsle das Thema organisch wenn ein Thema erschöpft ist — wie ein echter Mensch. Nicht immer wieder dieselbe Frage in anderer Form.
- Führe das Gespräch aktiv: bring selbst neue Themen ein, erzähl kurz etwas über dich (als Gesprächspartner), reagiere auf den Inhalt mit echtem Interesse.
- Vermeide IMMER diese Muster: "Wie lange...?", "Wie oft...?", "Wie lange dauert...?" mehrfach hintereinander. Wenn du eine Frage zur Zeit/Dauer gestellt hast, wechsle beim nächsten Mal das Thema oder den Fokus.
- Gute Gesprächsführung: Reagiere auf das WAS der Nutzer sagt, nicht nur auf das WIE. Zeige echtes Interesse am Inhalt.

SZENARIEN — bring das Gespräch in realistische Alltagssituationen:
Wenn passend, starte oder leite über zu echten Szenarien: im Café bestellen, sich vorstellen, über Hobbys reden, den Tag beschreiben, Einkaufen gehen, Wetter beschreiben, über Familie reden. Das macht das Üben lebendig.

KORREKTUREN — nur bei echten Fehlern:
- Korrigiere NUR bei echten Fehlern: falsche Grammatik, falsches Wort, falsche Satzstruktur.
- Wenn der Satz korrekt ist: KEINE Korrektur, KEIN "Man sagt", KEIN Wiederholen des Satzes. Einfach natürlich antworten.
- Bei einem Fehler: erst kurz auf den Inhalt reagieren, dann sanft korrigieren ("Kleiner Fehler: man sagt..."), dann weitermachen. Nie mehr als einen Fehler pro Antwort korrigieren — beim schlimmsten anfangen.
- Bei Wortfragen ("Was bedeutet X?", "Was heißt X?"): NUR die Bedeutung erklären, einfaches Beispiel geben, die Frage selbst NICHT korrigieren.

Aktuelles Datum/Zeit: ${new Date().toLocaleString()}${weatherBlock}${searchSnippet ? `\n\nLIVE-DATEN: ${searchSnippet}` : ''}`

  const trimmedMessages = messages.slice(-10).map(m => ({
    role: m.role,
    content: (m.content || '').slice(0, 600)
  }))

  // Dynamically discover available models from Groq, then try them in preference order
  // Preferred free-tier models first (as of 2026), enterprise/paid ones last
  const PREFERRED_ORDER = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'groq/compound-mini',
    'groq/compound',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'qwen/qwen3-32b',
  ]

  let modelsToTry = PREFERRED_ORDER
  try {
    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    const modelsData = await modelsRes.json()
    if (modelsData.data && modelsData.data.length > 0) {
      const available = new Set(modelsData.data.map(m => m.id))
      // Sort by preference order, then append any remaining available models not in our list
      const preferred = PREFERRED_ORDER.filter(id => available.has(id))
      const rest = modelsData.data.map(m => m.id).filter(id => !PREFERRED_ORDER.includes(id) && !id.includes('whisper') && !id.includes('guard') && !id.includes('orpheus'))
      modelsToTry = preferred.length > 0 ? [...preferred, ...rest] : [...PREFERRED_ORDER, ...rest]
    }
  } catch (_) { /* use hardcoded list if discovery fails */ }

  const payload = {
    messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
    max_tokens: 450,
    temperature: 0.7,
  }

  let lastError = 'No model available'
  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ ...payload, model }),
      })
      const data = await response.json()
      if (data.error) { lastError = data.error.message; continue }
      const reply = data.choices[0].message.content.trim().slice(0, 600)
      return res.status(200).json({ reply, usedSearch: searchWorked, model })
    } catch (err) {
      lastError = 'Network error'
      continue
    }
  }
  return res.status(500).json({ error: `Alle Modelle nicht verfügbar: ${lastError}` })
}

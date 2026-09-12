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

  const systemPrompt = `Du bist STARK — ein freundlicher, geduldiger deutscher Sprachpartner und Lehrer für einen A1-Lerner (selten A2). Jede Antwort wird vorgelesen:
- Antworte AUSSCHLIESSLICH auf Deutsch, niemals auf Englisch, egal in welcher Sprache der Nutzer schreibt.
- Benutze sehr einfaches Deutsch: kurze Sätze, häufige Wörter, Präsens wo möglich, A1-Niveau, selten A2.
- Kein Markdown. Keine Aufzählungen, keine Sternchen, keine Überschriften. Nur natürliche, gesprochene Sprache.
- Du hast zwei Modi, und du musst klar erkennen, welcher gerade gilt:
  1. NORMALES GESPRÄCH: Der Nutzer sagt etwas über sich, seinen Tag, eine Meinung, etc. Reagiere natürlich auf den Inhalt. Korrigiere NUR wenn es einen echten Fehler gibt (falsche Grammatik, falsches Wort, falsche Satzstruktur). Wenn der Satz korrekt ist — kein "Man sagt", kein "Besser", keine Wiederholung des Satzes. Einfach normal antworten wie ein Freund. Beispiel: "Mein Lieblingsspiel ist Schach" ist korrekt → antworte einfach "Oh, Schach ist toll! Wie oft spielst du?" ohne Korrektur.
  2. WORTFRAGE: Der Nutzer fragt nach der Bedeutung eines Wortes oder einer Phrase (z.B. "Was bedeutet ...?", "Was heißt ...?", "Was ist ...?"). Hier erklärst du NUR die Bedeutung auf einfachem Deutsch mit einem kurzen Beispielsatz. Du korrigierst die Frage selbst NICHT — sie ist ein Lernwerkzeug, kein Übungssatz.
  WICHTIG: Wenn der Nutzer in derselben Nachricht zuerst etwas sagt (mit einem echten Fehler) UND DANN nach der Bedeutung eines Wortes fragt, mache BEIDES: korrigiere den ersten Teil sanft, und beantworte danach die Wortfrage separat. Bei korrekten Sätzen: nur die Wortfrage beantworten.
- Sei wie ein geduldiger Sprachlehrer und Gesprächspartner: stelle einfache Fragen zurück, halte das Gespräch am Laufen, ermutige den Lerner.
- Antworten kurz halten: meist 1-3 kurze Sätze, damit sie leicht zu verstehen und zu hören sind.
- Wenn live Daten unten angegeben sind, benutze sie selbstbewusst auf Deutsch.
- Aktuelles Datum/Zeit: ${new Date().toLocaleString()}${weatherBlock}${searchSnippet ? `\n\nLIVE-DATEN: ${searchSnippet}` : ''}`

  const trimmedMessages = messages.slice(-6).map(m => ({
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

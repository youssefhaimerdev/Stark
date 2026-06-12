import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const WELCOME = "STARK ist online. Hallo! Lass uns Deutsch üben."
const SILENCE_DELAY = 1500
const PASSWORD = "STARK123"

export default function Home() {
  // Auth
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwShake, setPwShake] = useState(false)

  // Core
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [messages, setMessages] = useState([])
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [status, setStatus] = useState('STANDBY')
  const [conversationMode, setConversationMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [orbScale, setOrbScale] = useState(1)
  const [particles, setParticles] = useState([])

  // Voice
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [voiceRate, setVoiceRate] = useState(1.0)

  // Settings inputs
  const [keyInput, setKeyInput] = useState('')
  const [pwChangeInput, setPwChangeInput] = useState('')
  const [pwChangeDone, setPwChangeDone] = useState(false)

  // Refs
  const recognitionRef = useRef(null)
  const chatEndRef = useRef(null)
  const finalRef = useRef('')
  const orbAnimRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const convRef = useRef(false)
  const listeningRef = useRef(false)
  const speakingRef = useRef(false)
  const thinkingRef = useRef(false)
  const messagesRef = useRef([])
  const apiKeyRef = useRef('')
  const voiceRef = useRef(null)
  const voiceRateRef = useRef(1.0)
  const sendRef = useRef(null)
  const passwordRef = useRef(PASSWORD)

  useEffect(() => { convRef.current = conversationMode }, [conversationMode])
  useEffect(() => { listeningRef.current = isListening }, [isListening])
  useEffect(() => { speakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { thinkingRef.current = isThinking }, [isThinking])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { voiceRef.current = selectedVoice }, [selectedVoice])
  useEffect(() => { voiceRateRef.current = voiceRate }, [voiceRate])

  // Boot: load persisted data
  useEffect(() => {
    // Check if already unlocked this session
    const sessionUnlocked = sessionStorage.getItem('stark_unlocked')
    if (sessionUnlocked === '1') setUnlocked(true)

    const savedKey = localStorage.getItem('stark_key')
    if (savedKey) { setApiKey(savedKey); apiKeyRef.current = savedKey; setKeySaved(true); setKeyInput('••••••••••••••••••••••••') }

    const savedPw = localStorage.getItem('stark_pw')
    if (savedPw) passwordRef.current = savedPw

    const savedMsgs = localStorage.getItem('stark_history')
    if (savedMsgs) { try { const m = JSON.parse(savedMsgs); setMessages(m); messagesRef.current = m } catch {} }

    const savedRate = localStorage.getItem('stark_rate')
    if (savedRate) { setVoiceRate(parseFloat(savedRate)); voiceRateRef.current = parseFloat(savedRate) }

    // Generate particles
    const pts = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      dur: 6 + Math.random() * 10,
      delay: Math.random() * 8,
      opacity: 0.15 + Math.random() * 0.35,
    }))
    setParticles(pts)
  }, [])

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) localStorage.setItem('stark_history', JSON.stringify(messages.slice(-40)))
  }, [messages])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isThinking])

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices()
      setVoices(v)
      const savedVoiceName = localStorage.getItem('stark_voice')
      const preferred = (savedVoiceName && v.find(x => x.name === savedVoiceName))
        || v.find(x => x.lang && x.lang.toLowerCase().startsWith('de') && x.name.toLowerCase().includes('male'))
        || v.find(x => x.lang && x.lang.toLowerCase().startsWith('de'))
        || v.find(x => x.name.toLowerCase().includes('daniel'))
        || v[0]
      setSelectedVoice(preferred)
      voiceRef.current = preferred
    }
    window.speechSynthesis.onvoiceschanged = load
    load()
  }, [])

  const animateOrb = useCallback((active) => {
    if (orbAnimRef.current) cancelAnimationFrame(orbAnimRef.current)
    if (!active) { setOrbScale(1); return }
    const go = () => {
      setOrbScale(1 + Math.random() * 0.18)
      orbAnimRef.current = requestAnimationFrame(() => setTimeout(go, 70 + Math.random() * 90))
    }
    go()
  }, [])

  const clearSilence = () => { if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null } }

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setStatus('NO MIC ACCESS'); return }
    if (recognitionRef.current) {
      recognitionRef.current._active = false
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    finalRef.current = ''
    setTranscript('')
    clearSilence()

    // Detect mobile — iOS/Android need different recognition strategy
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

    const r = new SR()
    // On mobile: non-continuous avoids the duplicate-words bug caused by
    // the browser re-firing previous results on each onresult event.
    // On desktop: continuous gives smoother real-time transcript.
    r.continuous = !isMobile
    r.interimResults = true
    r.lang = 'de-DE'
    r._active = true
    r._processedIndex = -1  // track last processed result index to prevent duplicates

    r.onresult = (e) => {
      if (speakingRef.current) {
        window.speechSynthesis.cancel()
        speakingRef.current = false; setIsSpeaking(false); animateOrb(false)
      }

      let interim = ''
      // Only process results we haven't seen yet
      const startFrom = Math.max(e.resultIndex, r._processedIndex + 1)
      for (let i = startFrom; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          // Append only this new final chunk, never re-append old ones
          finalRef.current += e.results[i][0].transcript + ' '
          r._processedIndex = i
        } else {
          interim += e.results[i][0].transcript
        }
      }

      setTranscript(finalRef.current + interim)
      clearSilence()

      if (finalRef.current.trim() || interim.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          const text = finalRef.current.trim()
          if (text && sendRef.current) {
            if (recognitionRef.current) { recognitionRef.current._active = false; try { recognitionRef.current.stop() } catch {}; recognitionRef.current = null }
            setIsListening(false); listeningRef.current = false; setStatus('PROCESSING')
            sendRef.current(text); finalRef.current = ''; setTranscript('')
          }
        }, SILENCE_DELAY)
      }
    }

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setStatus('MIC ERROR'); r._active = false; setIsListening(false); listeningRef.current = false
    }

    r.onend = () => {
      // On mobile non-continuous mode: restart after each utterance to keep listening
      // On desktop continuous mode: restart only if unexpectedly stopped
      if (r._active && convRef.current) {
        // Small delay on mobile to avoid rapid restart loop
        setTimeout(() => { try { r.start() } catch {} }, isMobile ? 300 : 0)
      }
    }

    recognitionRef.current = r
    try { r.start(); setIsListening(true); listeningRef.current = true; setStatus('LISTENING') } catch { setStatus('MIC ERROR') }
  }, [animateOrb])

  const stopListening = useCallback(() => {
    clearSilence()
    if (recognitionRef.current) { recognitionRef.current._active = false; try { recognitionRef.current.stop() } catch {}; recognitionRef.current = null }
    setIsListening(false); listeningRef.current = false; finalRef.current = ''; setTranscript('')
  }, [])

  const speak = useCallback((text, onDone) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (voiceRef.current) utt.voice = voiceRef.current
    utt.rate = voiceRateRef.current; utt.pitch = 0.85; utt.volume = 1
    setIsSpeaking(true); speakingRef.current = true; setStatus('TRANSMITTING'); animateOrb(true)
    utt.onend = () => { setIsSpeaking(false); speakingRef.current = false; animateOrb(false); if (onDone) onDone() }
    utt.onerror = () => { setIsSpeaking(false); speakingRef.current = false; animateOrb(false); if (onDone) onDone() }
    window.speechSynthesis.speak(utt)
  }, [animateOrb])

  const detectWeather = (text) => {
    // Match: "weather in X", "what's the weather in X", "how's the weather in X", "temperature in X", etc.
    const patterns = [
      /(?:weather|temperature|forecast|how(?:'s| is) it)\s+(?:like\s+)?(?:in|at|for)\s+([a-zA-Z][a-zA-Z\s,]{1,35?)(?:\?|$)/i,
      /(?:in|at|for)\s+([a-zA-Z][a-zA-Z\s,]{1,35?)\s+(?:weather|temperature|forecast)/i,
      /weather[^?]*?(?:in|at|for)\s+([a-zA-Z][a-zA-Z\s,]{1,35?)(?:\?|$)/i,
    ]
    for (const p of patterns) {
      const m = text.match(p)
      if (m) return m[1].trim()
    }
    return null
  }

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !apiKeyRef.current) { if (!apiKeyRef.current) setStatus('NO API KEY'); return }
    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg]); setTranscript(''); setIsThinking(true); thinkingRef.current = true; setStatus('PROCESSING')

    let weatherData = null
    const city = detectWeather(text)
    if (city) {
      setStatus('FETCHING WEATHER')
      try { const w = await fetch(`/api/weather?city=${encodeURIComponent(city)}`); const j = await w.json(); if (!j.error) weatherData = j.summary } catch {}
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-groq-key': apiKeyRef.current },
        body: JSON.stringify({ messages: [...messagesRef.current, userMsg].slice(-5).map(m => ({ role: m.role, content: (m.content || "").slice(0, 800) })), weatherData }),
      })
      const data = await res.json()
      setIsThinking(false); thinkingRef.current = false
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Systemfehler: ${data.error}` }])
        setStatus('ERROR')
        if (convRef.current) setTimeout(() => startListening(), 1200)
        return
      }
      const reply = data.reply
      const label = data.usedSearch ? '🔍 ' : data.searchError ? '⚠️ ' : ''
      setMessages(prev => [...prev, { role: 'assistant', content: reply, searched: !!data.usedSearch, searchError: data.searchError }])
      speak(reply, () => { setStatus('STANDBY'); if (convRef.current) setTimeout(() => startListening(), 350) })
    } catch {
      setIsThinking(false); thinkingRef.current = false; setStatus('CONNECTION LOST')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Netzwerk nicht erreichbar. Bitte Verbindung prüfen.' }])
      if (convRef.current) setTimeout(() => startListening(), 2500)
    }
  }, [speak, startListening])

  useEffect(() => { sendRef.current = sendMessage }, [sendMessage])

  const toggleConv = useCallback(() => {
    if (convRef.current) {
      setConversationMode(false); convRef.current = false
      stopListening(); window.speechSynthesis.cancel()
      setIsSpeaking(false); speakingRef.current = false; animateOrb(false); setStatus('STANDBY')
    } else {
      setConversationMode(true); convRef.current = true; startListening()
    }
  }, [startListening, stopListening, animateOrb])

  const handleUnlock = () => {
    if (pwInput === passwordRef.current) {
      sessionStorage.setItem('stark_unlocked', '1')
      setUnlocked(true)
    } else {
      setPwError('ZUGANG VERWEIGERT')
      setPwShake(true)
      setTimeout(() => { setPwShake(false); setPwError('') }, 1800)
      setPwInput('')
    }
  }

  const saveApiKey = () => {
    const k = keyInput.trim()
    if (!k || k.includes('•')) return
    localStorage.setItem('stark_key', k); setApiKey(k); apiKeyRef.current = k; setKeySaved(true)
    setKeyInput('••••••••••••••••••••••••')
  }

  const clearHistory = () => {
    setMessages([]); messagesRef.current = []; localStorage.removeItem('stark_history')
    window.speechSynthesis.cancel(); setIsSpeaking(false); speakingRef.current = false; animateOrb(false)
    if (convRef.current) { setConversationMode(false); convRef.current = false; stopListening(); setStatus('STANDBY') }
  }

  const savePassword = () => {
    if (pwChangeInput.trim().length < 4) return
    localStorage.setItem('stark_pw', pwChangeInput.trim()); passwordRef.current = pwChangeInput.trim()
    setPwChangeInput(''); setPwChangeDone(true); setTimeout(() => setPwChangeDone(false), 2000)
  }

  const statusColor = { 'STANDBY':'#5a4a2e','LISTENING':'#ffcc00','PROCESSING':'#ffb300','TRANSMITTING':'#ffcc00','FETCHING WEATHER':'#ffb300','KEY ACCEPTED':'#00ff88','ERROR':'#ff4455','CONNECTION LOST':'#ff4455','NO API KEY':'#ff4455','NO MIC ACCESS':'#ff4455','MIC ERROR':'#ff4455' }[status] || '#5a4a2e'
  const statusLabelDE = { 'STANDBY':'BEREIT','LISTENING':'HÖRT ZU','PROCESSING':'DENKT NACH','TRANSMITTING':'SPRICHT','FETCHING WEATHER':'WETTER WIRD GEHOLT','KEY ACCEPTED':'SCHLÜSSEL OK','ERROR':'FEHLER','CONNECTION LOST':'VERBINDUNG VERLOREN','NO API KEY':'KEIN API-SCHLÜSSEL','NO MIC ACCESS':'KEIN MIKROFON','MIC ERROR':'MIKROFON-FEHLER' }[status] || status

  // ── PASSWORD GATE ──
  if (!unlocked) return (
    <>
      <Head><title>STARK — LOCKED</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div className={styles.gateWrap}>
        <div className={styles.gateBg} aria-hidden="true" />
        <div className={styles.gateScanlines} aria-hidden="true" />
        <div className={`${styles.gateCard} ${pwShake ? styles.shake : ''}`}>
          <div className={styles.gateOrb} aria-hidden="true">
            <div className={styles.gateOrbCore} />
            <div className={styles.gateOrbRing} />
          </div>
          <h1 className={styles.gateTitle}>STARK</h1>
          <p className={styles.gateSub}>ZUGANG ERFORDERLICH</p>
          <div className={styles.gateInputRow}>
            <input
              type="password"
              className={styles.gateInput}
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              placeholder="ZUGANGSCODE EINGEBEN"
              autoFocus
            />
            <button className={styles.gateBtn} onClick={handleUnlock}>▶</button>
          </div>
          {pwError && <p className={styles.gateError}>{pwError}</p>}
        </div>
      </div>
    </>
  )

  // ── MAIN APP ──
  return (
    <>
      <Head>
        <title>STARK</title>
        <meta name="description" content="STARK — Dein deutscher Sprachpartner" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%2308050a' stroke='%23ffcc00' stroke-width='1.5'/><circle cx='16' cy='16' r='5' fill='%23ffcc00' opacity='0.9'/></svg>" />
      </Head>

      <div className={styles.app}>
        {/* ── BACKGROUND ── */}
        <div className={styles.bgGrid} aria-hidden="true" />
        <div className={styles.bgHex} aria-hidden="true" />
        <div className={styles.bgGlow} aria-hidden="true" />
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.bgVignette} aria-hidden="true" />
        {particles.map(p => (
          <div key={p.id} className={styles.particle} aria-hidden="true" style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: `${p.size}px`, height: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }} />
        ))}

        {/* ── SIDEBAR ── */}
        <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>EINSTELLUNGEN</span>
              <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)}>✕</button>
            </div>

            <div className={styles.sideSection}>
              <p className={styles.sideSectionLabel}>GROQ API-SCHLÜSSEL</p>
              <p className={styles.sideSectionSub}>Kostenlos auf console.groq.com</p>
              <div className={styles.sideRow}>
                <input type="password" className={styles.sideInput} value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveApiKey()}
                  placeholder="gsk_..." autoComplete="off" />
                <button className={styles.sideBtn} onClick={saveApiKey}>SPEICHERN</button>
              </div>
              {keySaved && <p className={styles.sideOk}>● SCHLÜSSEL AKTIV</p>}
            </div>

            <div className={styles.sideDivider} />

            <div className={styles.sideSection}>
              <p className={styles.sideSectionLabel}>STIMME</p>
              <select className={styles.sideSelect} value={voices.indexOf(selectedVoice)}
                onChange={e => { const v = voices[parseInt(e.target.value)]; setSelectedVoice(v); voiceRef.current = v; localStorage.setItem('stark_voice', v.name) }}>
                {voices.map((v, i) => <option key={i} value={i}>{v.name}</option>)}
              </select>
              <p className={styles.sideSectionLabel} style={{marginTop:'14px'}}>SPRECHGESCHWINDIGKEIT — {voiceRate.toFixed(1)}×</p>
              <input type="range" min="0.6" max="1.6" step="0.1" value={voiceRate}
                className={styles.sideRange}
                onChange={e => { const v = parseFloat(e.target.value); setVoiceRate(v); voiceRateRef.current = v; localStorage.setItem('stark_rate', v) }} />
            </div>

            <div className={styles.sideDivider} />

            <div className={styles.sideSection}>
              <p className={styles.sideSectionLabel}>ZUGANGSCODE ÄNDERN</p>
              <div className={styles.sideRow}>
                <input type="password" className={styles.sideInput} value={pwChangeInput}
                  onChange={e => setPwChangeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && savePassword()}
                  placeholder="Neuer Code (min. 4 Zeichen)" />
                <button className={styles.sideBtn} onClick={savePassword}>SETZEN</button>
              </div>
              {pwChangeDone && <p className={styles.sideOk}>● CODE AKTUALISIERT</p>}
            </div>

            <div className={styles.sideDivider} />

            <div className={styles.sideSection}>
              <p className={styles.sideSectionLabel}>VERLAUF</p>
              <p className={styles.sideSectionSub}>Gesprächsverlauf ({messages.length} Nachrichten gespeichert)</p>
              <button className={styles.sideDangerBtn} onClick={clearHistory}>VERLAUF LÖSCHEN</button>
            </div>

            <div className={styles.sideDivider} />

            <div className={styles.sideSection}>
              <p className={styles.sideSectionLabel}>FUNKTIONEN</p>
              <div className={styles.capList}>
                {['Sprechen üben','Grammatik-Korrektur','Wortschatz','A1 / A2 Niveau','Aussprache','Alltagsdialoge','Fragen & Antworten','Freies Gespräch'].map(c => (
                  <span key={c} className={styles.capTag}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

        {/* ── MAIN ── */}
        <div className={`${styles.main} ${sidebarOpen ? styles.mainShifted : ''}`}>

          {/* Header */}
          <header className={styles.header}>
            <button className={styles.menuBtn} onClick={() => setSidebarOpen(o => !o)} aria-label="Open settings">
              <span /><span /><span />
            </button>
            <div className={styles.headerCenter}>
              <span className={styles.headerDot} />
              <span className={styles.headerTitle}>STARK</span>
            </div>
            <div className={styles.headerStatus}>
              <span className={styles.statusDot} style={{ background: statusColor, boxShadow: `0 0 7px ${statusColor}` }} />
              <span className={styles.statusLabel} style={{ color: statusColor }}>{statusLabelDE}</span>
            </div>
          </header>

          {/* Orb */}
          <div className={styles.orbWrap}>
            <div className={styles.orbAmbient} aria-hidden="true" />
            <div
              className={`${styles.orb} ${isListening ? styles.orbListening : ''} ${isSpeaking ? styles.orbSpeaking : ''} ${keySaved ? styles.orbClickable : ''}`}
              style={{ transform: `scale(${orbScale})` }}
              onClick={keySaved ? toggleConv : undefined}
              role={keySaved ? 'button' : undefined}
              tabIndex={keySaved ? 0 : undefined}
              aria-label={keySaved ? (conversationMode ? 'End conversation' : 'Start conversation') : undefined}
              onKeyDown={keySaved ? e => e.key === 'Enter' && toggleConv() : undefined}
            >
              <div className={styles.orbCore} />
              <div className={styles.orbHalo} />
              <div className={styles.orbArc1} />
              <div className={styles.orbArc2} />
              <div className={styles.orbArc3} />
              <div className={styles.orbRing1} />
              <div className={styles.orbRing2} />
            </div>
            <p className={styles.orbHint}>
              {!keySaved ? 'API-Schlüssel in Einstellungen hinzufügen ⚙' :
               conversationMode
                 ? isListening ? '● HÖRT ZU' : isSpeaking ? '◈ SPRICHT' : '◌ DENKT NACH'
                 : 'ANTIPPEN ZUM STARTEN'}
            </p>
          </div>

          {/* Chat */}
          <div className={styles.chatLog}>
            {messages.length === 0 && (
              <div className={styles.emptyState}>
                <p className={styles.emptyLine}>Bereit zum Üben.</p>
                <p className={styles.emptyHint}>Sag etwas auf Deutsch — über dich, den Tag, ein Hobby...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
                <span className={styles.msgRole}>
                {msg.role === 'user' ? 'DU' : 'STARK'}
                {msg.searched && <span className={styles.searchBadge}>● LIVE</span>}
                {msg.searchError && <span className={styles.errorBadge}>⚠ SEARCH FAILED</span>}
              </span>
                <p className={styles.msgText}>{msg.content}</p>
              </div>
            ))}
            {isThinking && (
              <div className={`${styles.message} ${styles.assistant}`}>
                <span className={styles.msgRole}>STARK</span>
                <div className={styles.thinking}><span /><span /><span /></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Transcript */}
          {transcript && (
            <div className={styles.transcriptBar}>
              <span className={styles.transcriptDot} />
              <span className={styles.transcriptText}>{transcript}</span>
            </div>
          )}

          {/* Controls */}
          <div className={styles.controls}>
            <button
              className={`${styles.micBtn} ${conversationMode ? styles.micActive : ''}`}
              onClick={keySaved ? toggleConv : undefined}
              disabled={!keySaved}
              aria-label={conversationMode ? 'End conversation' : 'Start conversation'}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {conversationMode
                  ? <rect x="6" y="6" width="12" height="12" rx="2" />
                  : <><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></>}
              </svg>
              <span className={styles.micLabel}>{conversationMode ? 'ENDE' : 'SPRECHEN'}</span>
            </button>
            <button className={styles.interruptBtn}
              onClick={() => {
                window.speechSynthesis.cancel(); setIsSpeaking(false); speakingRef.current = false; animateOrb(false)
                if (convRef.current) setTimeout(() => startListening(), 200)
                else setStatus('STANDBY')
              }}
              title="Interrupt STARK"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
            </button>
          </div>

        </div>
      </div>
    </>
  )
}

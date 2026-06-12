# STARK — Dein deutscher Sprachpartner

Ein persönlicher Sprach-AI-Tutor für Deutschlerner (A1, gelegentlich A2). Sprich auf Deutsch, bekomme einfache Antworten, sanfte Korrekturen und Übungsgespräche. Powered by Groq (free tier).

## Features

- 🎙️ Spracheingabe via Web Speech API (de-DE), live transkribiert
- 🔊 Sprachausgabe via Browser-TTS, bevorzugt deutsche Stimme
- 🇩🇪 Antworten ausschließlich auf einfachem A1/A2-Deutsch
- ✏️ Sanfte Fehlerkorrektur: Grammatik & Wortschatz
- ⚡ Schnelle Antworten via Groq's LLaMA 3.3 70B
- 📱 Funktioniert auf jedem Gerät im Browser
- 🔑 API-Schlüssel wird nur lokal im Browser gespeichert (nie an andere Server außer Groq gesendet)

## Setup

### 1. Kostenlosen Groq API-Schlüssel holen

Gehe zu [console.groq.com](https://console.groq.com), registriere dich und erstelle einen API-Schlüssel.

### 2. Lokal ausführen

```bash
npm install
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000), füge deinen Groq-Schlüssel ein und beginne zu sprechen.

### 3. Auf Vercel deployen (kostenlos)

**Option A — Vercel CLI:**
```bash
npm install -g vercel
vercel
```
Den Anweisungen folgen. Fertig.

**Option B — GitHub + Vercel Dashboard:**
1. Diesen Ordner in ein GitHub-Repo pushen
2. Auf [vercel.com](https://vercel.com) → New Project → Repo importieren
3. Keine Umgebungsvariablen nötig (der API-Schlüssel wird vom Nutzer im Browser eingegeben)
4. Auf Deploy klicken

## Nutzung

- Mikrofon-Taste tippen → sprechen → STARK antwortet auf Deutsch
- STARK korrigiert Fehler sanft und stellt einfache Rückfragen
- Stimme im Dropdown auswählen (idealerweise eine deutsche Stimme)
- Die **quadratische Taste** unterbricht STARK mitten im Satz
- Funktioniert am besten in **Chrome** (beste Web Speech API Unterstützung)

## Stack

- Next.js 14 (React)
- Groq API (LLaMA 3.3 70B)
- Web Speech API (Sprache, browser-nativ)
- Deployed auf Vercel

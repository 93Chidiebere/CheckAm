# CheckAM: Real-Time Collaborative Fact-Checking

> **Democratizing Truth and Combating Misinformation**

CheckAM is a real-time, decentralized fact-checking solution designed to counter misinformation, false claims, and statement exaggerations in Nigeria and across Africa. 

By combining the speed of **Google Gemini's Search-Grounded AI** with the democratic trust of a **decentralized real-time consensus engine** (inspired by X's Community Notes), CheckAM delivers context and source verification directly to users as they consume content online.

---

## Key Features

* **Real-time Page Scanning**: Dynamically scans news portals and social media feeds, highlighting known statements in soft color-coded underlines.
* **Glassmorphic Information Cards**: Hovering over highlighted claims displays a sleek overlay with a factual summary, verified sources, and trust consensus metrics.
* **Real-time WebSockets Voting**: Users can instantly rate notes as "Helpful" or "Not Helpful". Ratings and consensus bars update *instantly* across all open tabs without page reloads.
* **Interactive AI Auditing**: Users can highlight *any* text selection on a webpage and click "Fact-Check with CheckAM" to trigger a live Google Gemini API verification grounded in real-time Google search results.

---

## Tech Stack & Architecture

* **Frontend**: HTML5, Vanilla JavaScript, CSS variables (Custom Glassmorphism overlay).
* **Consensus Backend**: Node.js, Express, WebSockets (`ws` package).
* **Database**: Supabase (PostgreSQL) with a local JSON file fallback for offline mode.
* **AI Engine**: Google Gemini API with Google Search Grounding.
* **Hosting**: **Vercel** (Frontend/PWA), **Railway** (Consensus Backend).

---

## 📁 Repository Structure

```
CheckAM/
├── backend/
│   ├── node_modules/
│   ├── .env               # Private keys & database credentials
│   ├── database.json      # Local offline JSON database fallback
│   ├── package.json       # Dependencies (Express, ws, Supabase, Gemini)
│   ├── schema.sql         # SQL table migrations
│   └── server.js          # Core HTTP API & WebSocket Server
├── extension/
│   ├── background.js      # Service worker API proxy
│   ├── content.css        # Glassmorphic tooltip styles
│   ├── content.js         # DOM scanning, highlights, & WebSockets
│   ├── manifest.json      # Manifest V3 Extension Config
│   ├── popup.css          # Extension Popup Styling
│   ├── popup.html         # Extension popup HTML UI
│   └── popup.js           # Extension settings controller
├── index.html             # Homepage / Test portal featuring live media auditing
└── README.md              # Documentation
```

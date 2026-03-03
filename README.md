# CeliScan — AI Gluten Detector PWA

An AI-powered progressive web app for celiacs. Snap a photo of any food product to instantly check if it contains gluten — using GPT-4o Vision for ingredient analysis.

## Features

- **Scan** — Camera or gallery upload. AI reads ingredient list (any language), identifies gluten sources, and shows a certainty percentage.
- **Social** — Community feed. Share scans publicly to help other celiacs.
- **History** — Personal scan history with stats (safe/unsafe/uncertain counts).
- **PWA** — Installable on iOS and Android. Works offline for cached content.
- **Auth** — Email/password via Supabase. Scanning works without an account; history/sharing requires sign-in.

## Tech Stack

| Layer       | Tech                        |
|-------------|----------------------------|
| Frontend    | React 18 + Vite             |
| AI Vision   | OpenAI GPT-4o               |
| Backend/DB  | Supabase (Postgres + Auth + Storage) |
| PWA         | vite-plugin-pwa + Workbox   |
| Icons       | lucide-react                |

---

## Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd celiscan
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
VITE_OPENAI_API_KEY=sk-...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**OpenAI key** → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
**Supabase keys** → Your project → Settings → API

### 3. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Storage** → ensure the `scan-images` bucket exists and is public

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5. Build for Production

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, etc.).

---

## PWA Installation

- **iOS**: Open in Safari → Share → Add to Home Screen
- **Android**: Open in Chrome → browser menu → Install App

---

## Security Note

The OpenAI API key is used client-side (in the browser). This is fine for personal use or demos but exposes the key in the JavaScript bundle. For production, proxy the OpenAI call through a **Supabase Edge Function** to keep the key server-side.

---

## Project Structure

```
src/
├── App.jsx              — Root with auth context + tab routing
├── index.css            — Full design system (dark theme, CSS custom properties)
├── lib/
│   ├── supabase.js      — Supabase client + data helpers
│   └── analyze.js       — OpenAI GPT-4o vision analysis
├── components/
│   ├── Navbar.jsx       — Bottom tab navigation
│   ├── ResultCard.jsx   — Scan result display
│   ├── CertaintyRing.jsx — Animated SVG certainty meter
│   ├── AuthModal.jsx    — Sign in / sign up sheet
│   ├── LoadingSteps.jsx — Analysis progress indicator
│   └── ScanCard.jsx     — Card for social/history feeds
└── pages/
    ├── ScanPage.jsx     — Camera + analysis + results
    ├── SocialPage.jsx   — Public community feed
    └── HistoryPage.jsx  — Personal history + stats
supabase/
└── schema.sql           — Database schema + RLS policies
```

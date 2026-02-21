# Ski Predictor — Cross-Country World Cup Prediction Game

Compete with friends by predicting FIS Cross-Country World Cup podiums.

**Scoring:** 3 pts if you predict the winner correctly, +1 pt for each other podium athlete you got right (max 5 pts/race).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Auth + DB hosting | Supabase (free tier) |
| ORM | Prisma |
| Data source | FIS website (HTML parsing via cheerio) |
| Hosting | Vercel (free tier) |

---

## Setup guide

### 1. Install Node.js

Download and install Node.js 20 LTS from **https://nodejs.org** (choose "LTS").

After installing, open a terminal and verify:
```
node --version   # should print v20.x.x
npm --version
```

### 2. Install dependencies

In the project folder, run:
```
npm install
```

### 3. Create a Supabase project

1. Go to **https://supabase.com** and create a free account
2. Create a new project (choose any region)
3. Wait for it to provision (~1 minute)
4. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Go to **Settings → Database** and copy the **Transaction mode** connection string → `DATABASE_URL`
6. Copy the **Session mode** connection string → `DIRECT_URL`

> In Supabase the pooler connection strings are under:
> Settings → Database → Connection pooling → "Transaction" and "Session" modes

### 4. Configure environment variables

Copy the example file and fill in your values:
```
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://abcdef.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
DATABASE_URL=postgresql://postgres.abcdef:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.abcdef:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### 5. Push the database schema

```
npm run db:push
```

This creates all tables in your Supabase PostgreSQL database.

### 6. Enable email confirmation in Supabase (optional)

By default Supabase requires email confirmation. For local testing, you can disable it:
- Supabase Dashboard → Authentication → Settings → **disable "Enable email confirmations"**

### 7. Start the app

```
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Loading race data (FIS sync)

Race data is pulled from the FIS website. The calendar syncs automatically when any user visits the Races page. You only need to manually trigger results after a race finishes.

**Sync results for a completed race:**
```
curl -X POST "http://localhost:3000/api/fis/sync?action=results&raceId=58060-W&fisRaceId=49729"
```

- `raceId` — our internal ID: `{eventId}-W` or `{eventId}-M`. The event ID is visible in the URL when you hover over a race on our Races page (e.g. `/races/58060-W`).
- `fisRaceId` — the race ID from fis-ski.com. Find it in the results URL:
  `https://www.fis-ski.com/DB/general/results.html?sectorcode=CC&raceid=49729` → `fisRaceId=49729`

Syncing results automatically **scores all predictions** for that race.

> For production, set up a cron job (e.g., via Vercel Cron or a free service like cron-job.org) to call the sync endpoints on race days.

---

## Deployment on Vercel (free)

1. Push the code to GitHub
2. Go to **https://vercel.com** → New project → import your GitHub repo
3. Add the same environment variables from `.env.local` in Vercel's settings
4. Deploy

---

## How it works

### FIS data endpoints used

| Data | Endpoint |
|---|---|
| Race calendar | `data.fis-ski.com/fis_events/ajax/calendarfunctions/load_calendar.html?sectorcode=CC&seasoncode=2026&categorycode=WC` |
| Race results | `data.fis-ski.com/fis_events/ajax/raceresultsfunctions/details.html?sectorcode=CC&raceid={id}&competitors=` |

The results endpoint returns an HTML page with a JSON array of athletes and their positions embedded in a `<script>` tag.

### User flow

1. Sign up → create or join a group using an 8-character invite code
2. Before a race: pick your top 3 finishers
3. After the race: results are synced, predictions are scored
4. Check the group leaderboard to see who is winning the season

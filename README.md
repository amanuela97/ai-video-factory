# AI Video Factory

Automated YouTube educational video generator triggered via WhatsApp.

Send `topic | duration` via WhatsApp → receive a fully rendered MS Paint-style educational video.

---

## Architecture

```
WhatsApp → Next.js (Vercel) → Supabase → Worker (Railway)
  ├── Gemini v3 (script generation)
  ├── ElevenLabs (voiceover)
  ├── Nano Banana / FLUX (MS Paint images)
  └── FFmpeg (rendering)
→ Vercel Blob (video storage)
→ WhatsApp reply (link + cost)
```

---

## Cost Per Video

| Component        | Cost        |
|------------------|-------------|
| Gemini script    | ~€0.002     |
| ElevenLabs voice | €0.15–0.25  |
| Images           | €0.05–0.10  |
| Vercel Blob      | ~€0.01      |
| Worker (Railway) | ~€0.01–0.05 |
| **Total**        | **€0.22–0.40** |

---

## Project Structure

```
ai-video-factory/
├── apps/
│   ├── web/          ← Next.js API layer (Vercel)
│   └── worker/       ← Video pipeline engine (Railway)
├── packages/
│   └── prompts/      ← Shared Gemini prompt system
└── supabase/
    └── schema.sql    ← Database schema
```

---

## Setup

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Copy `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### 2. Vercel (Next.js API)

1. Push repo to GitHub
2. Import into Vercel, set `apps/web` as root directory
3. Set environment variables (see `apps/web/.env.local.example`)
4. Enable Vercel Blob storage
5. Deploy → webhook URL: `https://your-app.vercel.app/api/whatsapp`

### 3. WhatsApp Cloud API (Meta)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create app → enable WhatsApp → Cloud API
3. Get `Phone Number ID` and `Access Token`
4. Set webhook URL to your Vercel endpoint
5. Set `hub.verify_token` to match `WHATSAPP_VERIFY_TOKEN` in your env
6. Subscribe to `messages` events

### 4. Railway (Worker)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Set root directory to `apps/worker`
3. **Disable sleep mode** (critical — worker must always run)
4. Set environment variables (see `apps/worker/.env.example`)
5. Worker auto-restarts on crash via Railway's restart policy

### 5. YouTube Upload (Optional — Phase 12)

1. Enable YouTube Data API v3 in Google Cloud Console
2. Create OAuth2 credentials (web application type)
3. Run: `npx ts-node apps/worker/oauth-setup.ts`
4. Copy refresh token to `GOOGLE_REFRESH_TOKEN` in worker env

---

## Usage

Send a WhatsApp message to your configured number:

```
How compound interest works | 5min
```

or

```
The history of the internet | 8min
```

You will receive a WhatsApp reply with:
- Video title
- Duration
- Number of scenes
- Cost (€)
- Direct video link (Vercel Blob)

---

## Production Safety Rules

- Never call FFmpeg or AI APIs from Vercel (30s serverless timeout)
- All heavy processing runs exclusively in Railway
- Max 1 job processed at a time (no concurrent processing)
- Each pipeline step retries up to 3 times before marking job as failed
- On worker crash/restart, stuck jobs are automatically reset to `queued`

---

## Environment Variables

### Vercel (`apps/web`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `WHATSAPP_TOKEN` | Meta WhatsApp Cloud API token |
| `WHATSAPP_PHONE_ID` | WhatsApp phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Custom verify token for webhook |
| `GEMINI_API_KEY` | Google Gemini API key |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |

### Railway (`apps/worker`)

All of the above, plus:

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID (default: Rachel) |
| `NANO_BANANA_API_KEY` | Nano Banana API key (for character images) |
| `REPLICATE_API_KEY` | Replicate API key (for FLUX abstract images) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (YouTube, optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (YouTube, optional) |
| `GOOGLE_REFRESH_TOKEN` | Google refresh token (YouTube, optional) |

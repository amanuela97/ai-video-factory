---
name: YouTube Video Factory Plan
overview: A consolidated, step-by-step build plan for an automated YouTube video factory triggered via WhatsApp. Distilled from inst.md with all duplicate/conflicting content removed and the most refined versions of each component selected.
todos:
  - id: phase-1
    content: Create monorepo structure and install all dependencies for web, worker, and prompts packages
    status: completed
  - id: phase-2
    content: Set up Supabase project and run the schema SQL (videos, jobs, usage_events, scenes tables)
    status: completed
  - id: phase-3
    content: Build Next.js WhatsApp webhook handler and job creation lib (web app)
    status: completed
  - id: phase-4
    content: Build worker polling loop with stuck-job recovery and error handling shell
    status: completed
  - id: phase-5
    content: Implement Gemini v3 script generation with niche detection and prompt builder
    status: completed
  - id: phase-6
    content: Implement ElevenLabs voice generation, output single MP3 narration file
    status: completed
  - id: phase-7
    content: Implement dual-model image generation with MS Paint style firewall and scene routing
    status: completed
  - id: phase-8
    content: Implement FFmpeg rendering with Ken Burns zoom, burned subtitles, and reliable concat
    status: completed
  - id: phase-9
    content: Implement Vercel Blob upload and return public URL
    status: completed
  - id: phase-10
    content: Wire up WhatsApp reply, cost tracking, retry logic, and main process.ts orchestrator
    status: completed
  - id: phase-11
    content: Add thumbnail selection and generation logic
    status: completed
  - id: phase-12
    content: Add optional YouTube upload with OAuth2, thumbnail set, and publish scheduling
    status: completed
  - id: phase-13
    content: Deploy web to Vercel, worker to Railway, configure all env vars and WhatsApp webhook
    status: completed
isProject: false
---

# AI YouTube Video Factory — Build Plan

## What You Are Building

A **niche-aware, retention-optimized, deterministic YouTube content engine** controlled entirely via WhatsApp. You send a topic and duration; the system produces a fully rendered MS Paint-style educational video and replies with the hosted link and cost.

You are the only user. There is no dashboard, no frontend UI.

---

## System Architecture

```
YOU (WhatsApp message: "topic | duration")
        ↓
Next.js API on Vercel  (control plane only)
        ↓
Supabase  (state machine — jobs, videos, costs)
        ↓
Worker on Railway  (always-on processing engine)
   ├── Gemini v3  (retention-optimized script + scene timeline)
   ├── ElevenLabs  (voiceover from full narration)
   ├── Image generator  (Nano Banana or FLUX — MS Paint locked)
   └── FFmpeg  (scene rendering + Ken Burns zoom + subtitles)
        ↓
Vercel Blob  (public video URL)
        ↓
Supabase  (cost update, status = done)
        ↓
WhatsApp reply  (video link + cost breakdown)
        ↓ (optional Phase 12)
YouTube upload  (auto-publish or scheduled)
```

**Role of each service:**

- Next.js = API gateway only (no heavy processing)
- Railway Worker = all AI calls, FFmpeg, rendering
- Supabase = single source of truth for job state
- Vercel Blob = video file hosting
- WhatsApp Cloud API = input/output interface

**Critical constraint:** Never call FFmpeg or heavy AI from Vercel. All heavy work lives in Railway.

---

## Cost Budget


| Component        | Per Video      |
| ---------------- | -------------- |
| Gemini script    | ~€0.002        |
| ElevenLabs voice | €0.15–0.25     |
| Images           | €0.05–0.10     |
| Vercel Blob      | ~€0.01         |
| Worker (Railway) | ~€0.01–0.05    |
| **Total**        | **€0.22–0.40** |


Monthly fixed costs (30 videos/month): **€7–€12/month**

---

## Repo Structure

```
ai-video-factory/
│
├── apps/
│   ├── web/                          ← Next.js, deployed to Vercel
│   │   ├── app/api/
│   │   │   ├── whatsapp/route.ts     ← WhatsApp webhook entry point
│   │   │   ├── create-job/route.ts   ← manual job trigger (debug)
│   │   │   └── webhook-status/route.ts
│   │   └── lib/
│   │       ├── supabase.ts
│   │       ├── jobs.ts
│   │       ├── whatsapp.ts
│   │       ├── blob.ts
│   │       └── cost.ts
│   │
│   └── worker/                       ← Node.js, deployed to Railway
│       ├── index.ts                  ← polling loop
│       └── pipeline/
│           ├── process.ts            ← main job orchestrator
│           ├── gemini.ts
│           ├── voice.ts
│           ├── images.ts
│           ├── imagePromptOptimizer.ts
│           ├── imageRouter.ts
│           ├── render.ts
│           ├── thumbnail.ts
│           ├── upload.ts
│           └── retry.ts
│
├── packages/
│   └── prompts/
│       ├── systemStyle.ts            ← global visual style constants
│       ├── geminiPrompt.ts           ← v3 prompt builder + niche detection
│       └── niches.ts                 ← niche tone/hook/pacing configs
│
└── supabase/
    └── schema.sql
```

---

## Global Visual Style (Hard Locked — Never Changes)

This style is injected into every Gemini request and every image generation call.

```
VISUAL STYLE (ABSOLUTE — DO NOT DEVIATE):
- 16:9 widescreen
- intentionally bad MS Paint drawing style
- childish stick figures only
- thick wobbly black outlines
- flat solid colors only
- white background
- minimal composition, centered subjects
- lots of empty space
- dot eyes, round heads, line bodies
- simple geometric shapes only (circles, squares, lines)
- NO shading, NO gradients, NO lighting, NO realism, NO 3D
```

---

## Job Status State Machine

```
queued → generating_script → generating_voice → generating_images
       → rendering → uploading → done
       → failed (on any unrecoverable error)
```

On worker restart, reset any `processing` state back to `queued` to prevent stuck jobs.

---

## Phase 1 — Project Setup

**Goal:** Create the monorepo, install dependencies, configure TypeScript.

Steps:

1. Create repo: `ai-video-factory/`
2. Initialize `apps/web` as a Next.js 14+ App Router project
3. Initialize `apps/worker` as a plain Node.js TypeScript project
4. Create `packages/prompts` as a shared TypeScript module
5. Install shared dependencies:
  - `@supabase/supabase-js` (both web and worker)
  - `@google/generative-ai` (worker)
  - `@vercel/blob` (worker)
  - `axios` (worker)
  - `googleapis` (worker, for YouTube phase)
  - `fs`, `child_process` (Node built-ins for FFmpeg)
6. Create `.env` files (see Phase 13 for all required keys)

**Test:** `npm run dev` on web starts without errors. Worker compiles without errors.

---

## Phase 2 — Supabase Schema

**Goal:** Create the database that drives all state.

Run this in Supabase SQL editor:

```sql
create table videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  topic text,
  duration_seconds int,
  status text default 'queued',
  blob_url text,
  thumbnail_url text,
  total_cost numeric default 0,
  scene_count int default 0,
  created_at timestamp default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  status text default 'queued',
  current_step text default 'pending',
  input_topic text,
  input_duration int,
  user_phone text,
  retry_count int default 0,
  error text,
  created_at timestamp default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  service text,
  model text,
  cost numeric,
  metadata jsonb,
  created_at timestamp default now()
);

-- Optional: for scene-level debugging
create table scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  start_time int,
  end_time int,
  narration text,
  visual_prompt text
);
```

**Test:** Insert a dummy row into `videos` and `jobs`. Confirm foreign keys work.

---

## Phase 3 — Next.js API Layer (WhatsApp Webhook + Job Creation)

**Goal:** Receive WhatsApp messages, parse topic + duration, create job in Supabase.

### `apps/web/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

### `apps/web/lib/jobs.ts`

```ts
import { supabase } from "./supabase";

export async function createJob({
  topic,
  durationSeconds,
  userPhone,
}: {
  topic: string;
  durationSeconds: number;
  userPhone: string;
}) {
  const { data: video } = await supabase
    .from("videos")
    .insert({
      title: topic,
      topic,
      duration_seconds: durationSeconds,
      status: "queued",
    })
    .select()
    .single();

  const { data: job } = await supabase
    .from("jobs")
    .insert({
      video_id: video.id,
      input_topic: topic,
      input_duration: durationSeconds,
      user_phone: userPhone,
      status: "queued",
    })
    .select()
    .single();

  return job;
}
```

### `apps/web/app/api/whatsapp/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";

// Handle WhatsApp webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
    const from = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;

    if (!message) return NextResponse.json({ ok: true });

    // Expected format: "topic | duration" e.g. "How inflation works | 5min"
    const [topicRaw, durationRaw] = message.split("|");
    const topic = topicRaw?.trim();
    const durationMinutes = parseInt(durationRaw?.replace(/\D/g, "")) || 5;
    const durationSeconds = durationMinutes * 60;

    if (!topic)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const job = await createJob({ topic, durationSeconds, userPhone: from });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
```

**Test:** Use a tool like Postman to POST a mock WhatsApp payload to `/api/whatsapp`. Confirm a job row appears in Supabase with `status = queued`.

---

## Phase 4 — Worker Polling Loop

**Goal:** Worker continuously polls Supabase for queued jobs and processes them one at a time.

### `apps/worker/index.ts`

```ts
import { createClient } from "@supabase/supabase-js";
import { processJob } from "./pipeline/process";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getNextJob() {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  return data;
}

async function markJob(jobId: string, status: string, error?: string) {
  await supabase
    .from("jobs")
    .update({ status, ...(error ? { error } : {}) })
    .eq("id", jobId);
}

// On startup: reset any stuck "processing" jobs back to queued
async function resetStuckJobs() {
  await supabase
    .from("jobs")
    .update({ status: "queued" })
    .like("status", "%generating%")
    .or("status.eq.rendering,status.eq.uploading");
}

async function run() {
  console.log("Worker started...");
  await resetStuckJobs();

  while (true) {
    const job = await getNextJob();

    if (!job) {
      await sleep(2000);
      continue;
    }

    try {
      await markJob(job.id, "generating_script");
      await processJob(job, supabase, markJob);
      await markJob(job.id, "done");
    } catch (err: any) {
      console.error("Job failed:", err);
      await markJob(job.id, "failed", err.message);

      // Notify via WhatsApp on failure (implemented in Phase 10)
      try {
        const { sendWhatsAppMessage } = await import("./pipeline/whatsapp");
        await sendWhatsAppMessage({
          to: job.user_phone,
          message: `❌ Video failed\n\nError: ${err.message}`,
        });
      } catch {}
    }
  }
}

run();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

**Test:** Start the worker. Manually insert a `queued` job into Supabase. Confirm the worker picks it up and logs "processing". Status in DB should update.

---

## Phase 5 — Gemini Script Generation

**Goal:** Generate a fully timestamped, retention-optimized video script from topic + duration.

### `packages/prompts/niches.ts`

```ts
export const nichePrompts: Record<
  string,
  { hookStyle: string; tone: string; pacing: string }
> = {
  finance: {
    hookStyle: "contrarian financial insight or myth debunking",
    tone: "simple, practical, slightly dramatic",
    pacing: "slow clarity → fast insight spikes",
  },
  tech: {
    hookStyle: "surprising system behavior or hidden mechanism",
    tone: "curious, explanatory, slightly geeky",
    pacing: "concept → breakdown → visual analogy",
  },
  teded: {
    hookStyle: "story-based curiosity question",
    tone: "storytelling, emotional curiosity",
    pacing: "narrative → explanation → payoff",
  },
};

export function detectNiche(topic: string): keyof typeof nichePrompts {
  const t = topic.toLowerCase();
  if (
    t.includes("stock") ||
    t.includes("money") ||
    t.includes("interest") ||
    t.includes("invest")
  )
    return "finance";
  if (
    t.includes("code") ||
    t.includes("ai") ||
    t.includes("web") ||
    t.includes("software")
  )
    return "tech";
  return "teded";
}
```

### `packages/prompts/geminiPrompt.ts`

```ts
import { nichePrompts, detectNiche } from "./niches";

export function buildGeminiPrompt(
  topic: string,
  durationSeconds: number,
): string {
  const niche = detectNiche(topic);
  const style = nichePrompts[niche];

  return `
You are a world-class YouTube retention strategist and educational script director.

Your job is to create highly engaging educational videos that maximize watch time, retention, and curiosity.
You are NOT writing a lecture. You are writing a story-driven visual experience.

NICHE: ${niche}
HOOK STYLE: ${style.hookStyle}
TONE: ${style.tone}
PACING: ${style.pacing}

OUTPUT MUST BE STRICT JSON ONLY. No markdown, no explanation, no code fences.

HARD RULES:
- Must fully cover exactly ${durationSeconds} seconds total
- Scenes must be 4–9 seconds each (no longer, no shorter)
- No filler scenes
- Every scene must advance understanding OR curiosity
- Every 2–3 scenes must introduce a curiosity gap

RETENTION STRATEGY (MANDATORY):
1. OPEN LOOP: introduce unanswered questions early, delay payoff
2. MICRO-REWARDS: every scene reveals something new
3. CONTRAST: show "wrong vs right" or "before vs after"
4. PROGRESSIVE COMPLEXITY: each scene slightly increases depth
5. PAYOFF ENDING: final scenes resolve all open loops

HOOK RULE: First 10 seconds MUST contain a surprising fact, contradiction, or shocking simplification.

VISUAL STYLE (HARD LOCK — DO NOT DEVIATE):
- 16:9 widescreen
- MS Paint childish stick figures
- thick wobbly black outlines
- flat colors only, white background
- minimal composition, centered objects
- dot eyes, line bodies, simple geometric props
- NO realism, NO gradients, NO shading, NO 3D

VISUAL RULES:
- Every visual must be concrete (objects, actions — not concepts)
- Always describe what characters are DOING
- Always include at least 1 object per scene
- Avoid abstract visuals unless absolutely necessary

Topic: ${topic}
Target duration: ${durationSeconds} seconds

OUTPUT FORMAT (strict):
{
  "title": string,
  "duration_seconds": number,
  "scenes": [
    {
      "start": number,
      "end": number,
      "narration": string,
      "visual_prompt": string,
      "curiosity_hook": string,
      "retention_reason": string
    }
  ]
}
`.trim();
}
```

### `apps/worker/pipeline/gemini.ts`

```ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildGeminiPrompt } from "../../../packages/prompts/geminiPrompt";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateScript({
  topic,
  duration,
}: {
  topic: string;
  duration: number;
}) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = buildGeminiPrompt(topic, duration);

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim();

  // Strip markdown fences if Gemini wraps output
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let json: any;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const cost = estimateGeminiCost(rawText);
  return { ...json, cost };
}

function estimateGeminiCost(output: string): number {
  const tokens = output.length / 4;
  return tokens * 0.0000005;
}
```

**Test:** Run `generateScript({ topic: "How inflation works", duration: 300 })` in isolation. Log the output. Confirm valid JSON with scenes covering the full duration, no gaps or overlaps.

---

## Phase 6 — ElevenLabs Voice Generation

**Goal:** Convert the full narration (all scenes concatenated) into a single audio track, then split it into per-scene audio segments aligned to timestamps.

### `apps/worker/pipeline/voice.ts`

```ts
import axios from "axios";
import fs from "fs";
import path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // default voice

export async function generateVoice(script: {
  scenes: { narration: string; start: number; end: number }[];
}) {
  const fullNarration = script.scenes.map((s) => s.narration).join(" ");

  // Generate single audio track from full narration
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    { text: fullNarration, model_id: "eleven_monolingual_v1" },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    },
  );

  fs.mkdirSync("./tmp", { recursive: true });
  const fullAudioPath = "./tmp/narration_full.mp3";
  fs.writeFileSync(fullAudioPath, response.data);

  // Estimate cost: ElevenLabs charges ~$0.30/1000 chars on Starter
  const cost = (fullNarration.length / 1000) * 0.3;

  return { fullAudioPath, cost };
}
```

**Note on audio splitting:** In Phase 8, FFmpeg will extract the correct audio segment per scene using `-ss` (start time) and `-t` (duration) from the single full audio file. No need to pre-split.

**Test:** Call `generateVoice` with a mock script. Confirm `./tmp/narration_full.mp3` is created and playable.

---

## Phase 7 — Image Generation (MS Paint Style — Double Enforcement)

**Goal:** Generate one image per scene, enforcing MS Paint style at two levels: Gemini output (already constrained) + image prompt firewall (applied here).

### `apps/worker/pipeline/imagePromptOptimizer.ts`

This is the "style firewall" — applied to every prompt before calling the image model.

```ts
export function optimizeImagePrompt(scene: {
  visual_prompt: string;
  narration: string;
}): string {
  return `
ABSOLUTE STYLE LOCK — MS Paint doodle ONLY.

REQUIRED:
- 16:9 widescreen composition
- childish stick figures with thick wobbly black outlines
- flat solid colors only
- white background
- minimal detail, centered subject
- simple shapes only (circles, squares, lines)
- exaggerated simplicity

FORBIDDEN:
- realistic humans or faces
- cinematic lighting or shadows
- 3D rendering
- detailed textures
- anime style
- illustration polish or gradients

SCENE:
${scene.visual_prompt}
`.trim();
}
```

### `apps/worker/pipeline/imageRouter.ts`

Routes each scene to the most appropriate image model.

```ts
export function chooseImageModel(scene: {
  visual_prompt: string;
}): "nano-banana" | "flux" {
  const text = scene.visual_prompt.toLowerCase();

  const isCharacterScene =
    text.includes("stick") ||
    text.includes("figure") ||
    text.includes("person") ||
    text.includes("man") ||
    text.includes("woman");

  const isAbstractScene =
    text.includes("graph") ||
    text.includes("chart") ||
    text.includes("background") ||
    text.includes("diagram") ||
    text.includes("map");

  if (isAbstractScene) return "flux";
  return "nano-banana"; // default — better style consistency for characters
}
```

### `apps/worker/pipeline/images.ts`

```ts
import axios from "axios";
import fs from "fs";
import { optimizeImagePrompt } from "./imagePromptOptimizer";
import { chooseImageModel } from "./imageRouter";

export async function generateImages(
  scenes: any[],
): Promise<{ paths: string[]; cost: number }> {
  fs.mkdirSync("./tmp/images", { recursive: true });

  const paths: string[] = [];
  let totalCost = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const model = chooseImageModel(scene);
    const prompt = optimizeImagePrompt(scene);

    const imageBuffer =
      model === "flux" ? await callFlux(prompt) : await callNanoBanana(prompt);

    const imagePath = `./tmp/images/scene_${i}.png`;
    fs.writeFileSync(imagePath, imageBuffer);
    paths.push(imagePath);

    totalCost += 0.01; // adjust per provider pricing
  }

  return { paths, cost: totalCost };
}

async function callNanoBanana(prompt: string): Promise<Buffer> {
  // Replace with actual Nano Banana API endpoint
  const res = await axios.post(
    "https://api.nano-banana.com/generate", // placeholder — update with real endpoint
    { prompt, width: 1920, height: 1080 },
    {
      headers: { Authorization: `Bearer ${process.env.NANO_BANANA_API_KEY}` },
      responseType: "arraybuffer",
    },
  );
  return Buffer.from(res.data);
}

async function callFlux(prompt: string): Promise<Buffer> {
  // Replace with actual FLUX API endpoint (e.g. Replicate or fal.ai)
  const res = await axios.post(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
    { input: { prompt, aspect_ratio: "16:9" } },
    {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}` },
      responseType: "arraybuffer",
    },
  );
  return Buffer.from(res.data);
}
```

**Test:** Generate images for a 3-scene mock script. Confirm PNG files are created at `./tmp/images/`. Visually verify MS Paint style is maintained.

---

## Phase 8 — FFmpeg Video Rendering

**Goal:** Combine each scene's image + audio segment into a clip, add Ken Burns zoom, add burned-in subtitles, then concatenate all clips into the final video.

### `apps/worker/pipeline/render.ts`

```ts
import { execSync } from "child_process";
import fs from "fs";

type SceneAsset = {
  start: number;
  end: number;
  narration: string;
  imagePath: string;
  fullAudioPath: string; // single narration file — we extract segment
};

export async function renderScenes(scenes: SceneAsset[]): Promise<string[]> {
  fs.mkdirSync("./tmp/scenes", { recursive: true });
  const outputs: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const duration = s.end - s.start;
    const output = `./tmp/scenes/scene_${i}.mp4`;

    // Sanitize narration for drawtext (escape special characters)
    const safeNarration = s.narration
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .slice(0, 80);

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${s.imagePath}"`,
      `-ss ${s.start} -t ${duration} -i "${s.fullAudioPath}"`,
      `-t ${duration}`,
      `-vf "scale=1920:1080,zoompan=z='min(zoom+0.0008,1.08)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',drawtext=text='${safeNarration}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-th-40"`,
      `-c:v libx264 -pix_fmt yuv420p`,
      `-c:a aac -b:a 192k`,
      `-shortest`,
      `"${output}"`,
    ].join(" ");

    execSync(cmd, { stdio: "inherit" });
    outputs.push(output);
  }

  return outputs;
}

export async function concatScenes(sceneFiles: string[]): Promise<string> {
  const listPath = "./tmp/concat_list.txt";
  fs.writeFileSync(listPath, sceneFiles.map((f) => `file '${f}'`).join("\n"));

  const output = "./tmp/final.mp4";

  // Re-encode on concat for reliable audio sync (not -c copy)
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac "${output}"`,
    { stdio: "inherit" },
  );

  return output;
}
```

**Test:** Render a 3-scene video. Play `./tmp/final.mp4`. Confirm: correct duration, Ken Burns motion visible, subtitles displayed, audio synced to visuals.

---

## Phase 9 — Upload to Vercel Blob

**Goal:** Upload the final rendered video to Vercel Blob and get a public URL.

### `apps/worker/pipeline/upload.ts`

```ts
import { put } from "@vercel/blob";
import fs from "fs";

export async function uploadToBlob(filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const filename = `video-${Date.now()}.mp4`;

  const result = await put(filename, fileBuffer, { access: "public" });

  return result.url;
}
```

**Test:** Upload a small dummy `.mp4`. Confirm a public URL is returned and the file is accessible in a browser.

---

## Phase 10 — WhatsApp Response + Error Handling + Cost Tracking

**Goal:** Send video result back via WhatsApp, track all costs per service, handle failures with retry and notification.

### `apps/web/lib/whatsapp.ts` (also imported by worker)

```ts
import axios from "axios";

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID!;

export async function sendWhatsAppMessage({
  to,
  message,
}: {
  to: string;
  message: string;
}) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
}

export async function sendVideoReady(
  to: string,
  video: {
    title: string;
    duration_seconds: number;
    total_cost: number;
    blob_url: string;
    scene_count: number;
  },
) {
  const minutes = Math.floor(video.duration_seconds / 60);
  const seconds = video.duration_seconds % 60;
  const msg = `🎬 Video Ready\n\nTitle: ${video.title}\nDuration: ${minutes}:${String(seconds).padStart(2, "0")}\nScenes: ${video.scene_count}\n\n💰 Cost: €${video.total_cost.toFixed(2)}\n\n▶️ Watch:\n${video.blob_url}`;
  await sendWhatsAppMessage({ to, message: msg });
}
```

### `apps/web/lib/cost.ts`

```ts
import { supabase } from "./supabase";

export async function trackCost({
  videoId,
  service,
  model,
  cost,
  metadata = {},
}: {
  videoId: string;
  service: string;
  model?: string;
  cost: number;
  metadata?: any;
}) {
  await supabase
    .from("usage_events")
    .insert({ video_id: videoId, service, model, cost, metadata });

  const { data } = await supabase
    .from("usage_events")
    .select("cost")
    .eq("video_id", videoId);
  const total = data?.reduce((sum, e) => sum + e.cost, 0) ?? 0;
  await supabase.from("videos").update({ total_cost: total }).eq("id", videoId);
}
```

### `apps/worker/pipeline/retry.ts`

```ts
export async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await sleep(2000 * (i + 1)); // exponential backoff: 2s, 4s, 6s
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

### `apps/worker/pipeline/process.ts` — Main Orchestrator

```ts
import { generateScript } from "./gemini";
import { generateVoice } from "./voice";
import { generateImages } from "./images";
import { renderScenes, concatScenes } from "./render";
import { uploadToBlob } from "./upload";
import { trackCost } from "../../lib/cost";
import { sendVideoReady } from "../../lib/whatsapp";
import { retry } from "./retry";

export async function processJob(job: any, supabase: any, markJob: Function) {
  const videoId = job.video_id;

  // 1. Generate script
  const script = await retry(() =>
    generateScript({ topic: job.input_topic, duration: job.input_duration }),
  );
  await trackCost({
    videoId,
    service: "gemini",
    model: "gemini-1.5-flash",
    cost: script.cost,
  });

  // 2. Generate voice
  await markJob(job.id, "generating_voice");
  const voice = await retry(() => generateVoice(script));
  await trackCost({ videoId, service: "elevenlabs", cost: voice.cost });

  // 3. Generate images
  await markJob(job.id, "generating_images");
  const { paths: imagePaths, cost: imageCost } = await retry(() =>
    generateImages(script.scenes),
  );
  await trackCost({ videoId, service: "images", cost: imageCost });

  // Build scene assets
  const sceneAssets = script.scenes.map((scene: any, i: number) => ({
    ...scene,
    imagePath: imagePaths[i],
    fullAudioPath: voice.fullAudioPath,
  }));

  // 4. Render video
  await markJob(job.id, "rendering");
  const sceneFiles = await renderScenes(sceneAssets);
  const finalVideoPath = await concatScenes(sceneFiles);

  // 5. Generate thumbnail (from scene with highest impact)
  const { generateThumbnail, pickThumbnailScene } = await import("./thumbnail");
  const thumbnailScene = pickThumbnailScene(script.scenes);
  const thumbnailUrl = await generateThumbnail(thumbnailScene);

  // 6. Upload
  await markJob(job.id, "uploading");
  const blobUrl = await uploadToBlob(finalVideoPath);

  // 7. Update Supabase
  const { data: video } = await supabase
    .from("videos")
    .update({
      blob_url: blobUrl,
      thumbnail_url: thumbnailUrl,
      status: "done",
      scene_count: script.scenes.length,
    })
    .eq("id", videoId)
    .select()
    .single();

  // 8. Send WhatsApp reply
  await sendVideoReady(job.user_phone, video);
}
```

**Test:** Trigger a full end-to-end run from a WhatsApp message. Confirm: WhatsApp receives the video link, cost is tracked in `usage_events`, video status is `done`.

---

## Phase 11 — Thumbnail Generation

**Goal:** Auto-select the highest-impact scene and generate a YouTube thumbnail.

### `apps/worker/pipeline/thumbnail.ts`

```ts
import { optimizeImagePrompt } from "./imagePromptOptimizer";
import { uploadToBlob } from "./upload";

export function pickThumbnailScene(scenes: any[]): any {
  return scenes.reduce(
    (best: any, current: any) => {
      const score =
        (current.curiosity_hook?.length ?? 0) +
        (current.visual_prompt.includes("problem") ? 15 : 0) +
        (current.visual_prompt.includes("contrast") ? 10 : 0) +
        (current.narration.includes("?") ? 10 : 0);

      return score > (best._score ?? 0) ? { ...current, _score: score } : best;
    },
    { ...scenes[0], _score: 0 },
  );
}

export async function generateThumbnail(scene: any): Promise<string> {
  const prompt = `
MS Paint style YouTube thumbnail. 16:9 widescreen.
VERY exaggerated stick figure emotion. Bold simple shapes.
High contrast flat colors. Minimal text (1–4 words max).
Make viewer ask "what is happening?".

SCENE: ${scene.visual_prompt}

FORBIDDEN: realism, gradients, 3D, detailed textures.
`.trim();

  // Reuse image generation — call your preferred model directly
  const { generateImages } = await import("./images");
  const { paths } = await generateImages([{ ...scene, visual_prompt: prompt }]);
  return await uploadToBlob(paths[0]);
}
```

---

## Phase 12 — YouTube Upload (Optional)

**Goal:** Automatically upload the rendered video to YouTube (private by default, optionally scheduled).

**Prerequisites:**

- Google Cloud Project with YouTube Data API v3 enabled
- OAuth2 client credentials
- Refresh token obtained via one-time manual OAuth flow

### `apps/worker/pipeline/youtube.ts`

```ts
import { google } from "googleapis";
import fs from "fs";

export async function uploadToYouTube({
  filePath,
  title,
  description,
  thumbnailPath,
  publishAt,
}: {
  filePath: string;
  title: string;
  description: string;
  thumbnailPath?: string;
  publishAt?: string; // ISO 8601, e.g. "2026-06-15T18:00:00Z"
}) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT!,
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const videoRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description, categoryId: "27" }, // 27 = Education
      status: {
        privacyStatus: publishAt ? "private" : "unlisted",
        ...(publishAt ? { publishAt } : {}),
      },
    },
    media: { body: fs.createReadStream(filePath) },
  });

  if (thumbnailPath && videoRes.data.id) {
    await youtube.thumbnails.set({
      videoId: videoRes.data.id,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
  }

  return videoRes.data;
}
```

**Test:** Upload a short test video to YouTube. Confirm it appears as `private` in YouTube Studio.

---

## Phase 13 — Deployment

### Supabase

1. Create project at supabase.com
2. Run `supabase/schema.sql` in the SQL editor
3. Copy `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role key used only in backend)

### Vercel (Next.js web app)

1. Push repo to GitHub
2. Import into Vercel → select `apps/web` as root
3. Set environment variables:
  ```
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   WHATSAPP_TOKEN
   WHATSAPP_PHONE_ID
   WHATSAPP_VERIFY_TOKEN
   GEMINI_API_KEY
   BLOB_READ_WRITE_TOKEN
  ```
4. Enable Vercel Blob storage and copy `BLOB_READ_WRITE_TOKEN`
5. Deploy → note webhook URL: `https://your-app.vercel.app/api/whatsapp`

### WhatsApp Cloud API (Meta)

1. Go to developers.facebook.com → create app → enable WhatsApp → Cloud API
2. Get `Phone Number ID` and `Access Token`
3. Set webhook URL to your Vercel endpoint
4. Set `hub.verify_token` to match `WHATSAPP_VERIFY_TOKEN`
5. Subscribe to `messages` events

### Railway (Worker)

1. Go to railway.app → New Project → Deploy from GitHub
2. Set root directory to `apps/worker`
3. Set start command: `npx ts-node index.ts` (or `node dist/index.js` if pre-built)
4. **Disable sleep mode** — worker must always be running
5. Set environment variables:
  ```
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   GEMINI_API_KEY
   ELEVENLABS_API_KEY
   ELEVENLABS_VOICE_ID
   BLOB_READ_WRITE_TOKEN
   NANO_BANANA_API_KEY    (or REPLICATE_API_KEY for FLUX)
   WHATSAPP_TOKEN
   WHATSAPP_PHONE_ID
  ```
6. Railway auto-restarts on crash — this handles basic failure recovery

### Production Safety Rules

- Never call FFmpeg or AI APIs from Vercel (serverless timeout = 30s max)
- All heavy processing lives exclusively in Railway
- Max 1 job processed at a time
- Max ~10 scenes per video to control cost
- Retry each pipeline step up to 3 times before marking job as failed

---

## Build Order Summary


| Phase | What Gets Built                        | How to Test                                      |
| ----- | -------------------------------------- | ------------------------------------------------ |
| 1     | Monorepo + dependencies                | Both apps compile without errors                 |
| 2     | Supabase schema                        | Insert/query test rows                           |
| 3     | WhatsApp webhook + job creation        | POST mock payload → job appears in DB            |
| 4     | Worker polling loop                    | Manual job insert → worker picks it up           |
| 5     | Gemini script generation               | Isolated call → valid JSON output                |
| 6     | ElevenLabs voice generation            | MP3 file created, playable                       |
| 7     | Image generation (dual model routing)  | PNGs created, MS Paint style visible             |
| 8     | FFmpeg rendering                       | final.mp4 plays with zoom, subtitles, audio sync |
| 9     | Vercel Blob upload                     | Public URL returned, video accessible            |
| 10    | WhatsApp reply + cost tracking + retry | Full flow triggered, WhatsApp receives result    |
| 11    | Thumbnail generation                   | Thumbnail PNG uploaded, URL stored in DB         |
| 12    | YouTube upload (optional)              | Video appears in YouTube Studio                  |
| 13    | Deployment to Vercel + Railway         | Live system responds to real WhatsApp messages   |



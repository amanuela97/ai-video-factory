import axios from "axios";
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeImagePrompt } from "./imagePromptOptimizer";
import type { Scene } from "./gemini";
import { uploadToBlob } from "./upload";
import { hashKey, getCached, setCached, downloadToFile } from "../lib/cache";

export interface ImageResult {
  paths: string[];
  cost: number;
}

export async function generateImages(
  scenes: Scene[],
  supabase?: SupabaseClient
): Promise<ImageResult> {
  const imagesDir = path.resolve("./tmp/images");
  fs.mkdirSync(imagesDir, { recursive: true });

  // Pre-fill with empty strings so indexes stay aligned
  const imagePaths: string[] = new Array(scenes.length).fill("");
  let totalCost = 0;

  // ── Phase 1: Serve cache hits immediately ──────────────────────────────────
  const toGenerate: { index: number; prompt: string; imagePath: string; cacheKey: string }[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const prompt = optimizeImagePrompt(scenes[i]);
    const imagePath = path.join(imagesDir, `scene_${i}.png`);
    const cacheKey = hashKey(prompt);

    if (supabase) {
      const cached = await getCached<{ blobUrl: string }>(supabase, "image", cacheKey);
      if (cached) {
        console.log(`Image ${i + 1}/${scenes.length}: Cache hit — reusing`);
        await downloadToFile(cached.blobUrl, imagePath);
        imagePaths[i] = imagePath;
        continue;
      }
    }

    toGenerate.push({ index: i, prompt, imagePath, cacheKey });
  }

  if (toGenerate.length === 0) {
    console.log("All images served from cache");
    return { paths: imagePaths, cost: 0 };
  }

  console.log(
    `Generating ${toGenerate.length} images via Replicate` +
    (toGenerate.length < scenes.length ? ` (${scenes.length - toGenerate.length} cached)` : "") +
    "..."
  );

  // ── Phase 2: Submit all predictions in parallel (stagger 300ms to avoid burst 429) ───
  const predictionIds: string[] = [];
  for (const { prompt } of toGenerate) {
    const id = await submitPrediction(prompt);
    predictionIds.push(id);
    await sleep(300);
  }

  // ── Phase 3: Poll all predictions concurrently until all complete ───────────
  const imageUrls = await pollAll(predictionIds);

  // ── Phase 4: Download all images in parallel + write cache ───────────────────
  await Promise.all(
    toGenerate.map(async ({ index, imagePath, cacheKey }, i) => {
      const imgRes = await axios.get(imageUrls[i], { responseType: "arraybuffer", timeout: 60_000 });
      fs.writeFileSync(imagePath, Buffer.from(imgRes.data));
      imagePaths[index] = imagePath;
      totalCost += 0.01;

      if (supabase) {
        try {
          const blobUrl = await uploadToBlob(imagePath);
          await setCached(supabase, "image", cacheKey, { blobUrl });
        } catch (err) {
          console.warn(`Image cache write failed for scene ${index}:`, err);
        }
      }
    })
  );

  console.log(`Images generated: ${toGenerate.length} files | est. cost: €${totalCost.toFixed(2)}`);
  return { paths: imagePaths, cost: totalCost };
}

// Submit a single prediction and return its ID.
// Retries up to 5× on 429 with exponential backoff.
async function submitPrediction(prompt: string): Promise<string> {
  if (!process.env.REPLICATE_API_KEY) throw new Error("Missing REPLICATE_API_KEY");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await axios.post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
        {
          input: {
            prompt,
            aspect_ratio: "16:9",
            num_inference_steps: 4,
            output_format: "png",
          },
        },
        {
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      return res.data.id as string;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        const waitMs = 10_000 * (attempt + 1);
        console.warn(`Replicate 429 on submission attempt ${attempt + 1}. Waiting ${waitMs / 1000}s...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Replicate submission rate-limited after 5 attempts");
}

// Poll all prediction IDs concurrently every 3s until every one has succeeded.
async function pollAll(predictionIds: string[]): Promise<string[]> {
  const imageUrls: (string | null)[] = new Array(predictionIds.length).fill(null);
  const pending = new Set(predictionIds.map((_, i) => i));

  for (let tick = 0; tick < 150 && pending.size > 0; tick++) {
    await sleep(3000);

    await Promise.all(
      [...pending].map(async (i) => {
        const res = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionIds[i]}`,
          { headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}` } }
        );

        if (res.data.status === "succeeded") {
          imageUrls[i] = res.data.output?.[0];
          pending.delete(i);
          console.log(`Image ${i + 1}/${predictionIds.length} ready`);
        } else if (res.data.status === "failed") {
          throw new Error(`FLUX prediction ${predictionIds[i]} failed: ${res.data.error}`);
        }
      })
    );
  }

  if (pending.size > 0) {
    throw new Error(`${pending.size} Replicate predictions timed out after 7.5 minutes`);
  }

  return imageUrls as string[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

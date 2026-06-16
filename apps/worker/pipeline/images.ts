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

  const paths: string[] = [];
  let totalCost = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prompt = optimizeImagePrompt(scene);
    const imagePath = path.join(imagesDir, `scene_${i}.png`);

    // Check per-scene cache
    const imageKey = hashKey(prompt);
    if (supabase) {
      const cached = await getCached<{ blobUrl: string }>(supabase, "image", imageKey);
      if (cached) {
        console.log(`Image ${i + 1}/${scenes.length}: Cache hit — reusing`);
        await downloadToFile(cached.blobUrl, imagePath);
        paths.push(imagePath);
        continue;
      }
    }

    console.log(`Generating image ${i + 1}/${scenes.length} using flux`);
    const imageBuffer = await callFluxWithBackoff(prompt, i);
    fs.writeFileSync(imagePath, imageBuffer);
    paths.push(imagePath);
    totalCost += 0.01;

    // Upload to Vercel Blob and store in cache for future reuse
    if (supabase) {
      try {
        const blobUrl = await uploadToBlob(imagePath);
        await setCached(supabase, "image", imageKey, { blobUrl });
      } catch (err) {
        console.warn(`Image cache write failed for scene ${i}:`, err);
      }
    }
  }

  console.log(`Images generated: ${paths.length} files | est. cost: €${totalCost.toFixed(2)}`);

  return { paths, cost: totalCost };
}

// Wraps callFlux with 429-aware retry and a fixed inter-request delay.
// Replicate's flux-schnell has a shared GPU queue and rate-limits bursts.
async function callFluxWithBackoff(prompt: string, sceneIndex: number): Promise<Buffer> {
  // Stagger requests: add a base delay between each scene to avoid burst 429s
  if (sceneIndex > 0) await sleep(2000);

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callFlux(prompt);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        const waitMs = 10_000 * (attempt + 1); // 10s, 20s, 30s …
        console.warn(`Replicate 429 on scene ${sceneIndex + 1}, attempt ${attempt + 1}. Waiting ${waitMs / 1000}s...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Replicate rate-limited after ${maxAttempts} attempts on scene ${sceneIndex + 1}`);
}

// FLUX via Replicate
// Uses flux-schnell for speed and cost efficiency
async function callFlux(prompt: string): Promise<Buffer> {
  if (!process.env.REPLICATE_API_KEY) {
    throw new Error("Missing REPLICATE_API_KEY");
  }

  // Step 1: Create prediction
  const createRes = await axios.post(
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

  const predictionId = createRes.data.id;

  // Step 2: Poll for completion
  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(2000);

    const pollRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_KEY}` },
      }
    );

    if (pollRes.data.status === "succeeded") {
      imageUrl = pollRes.data.output?.[0];
      break;
    }

    if (pollRes.data.status === "failed") {
      throw new Error(`FLUX prediction failed: ${pollRes.data.error}`);
    }
  }

  if (!imageUrl) throw new Error("FLUX prediction timed out");

  // Step 3: Download image
  const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
  return Buffer.from(imgRes.data);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

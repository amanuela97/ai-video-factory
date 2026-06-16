import axios from "axios";
import fs from "fs";
import path from "path";
import { optimizeImagePrompt } from "./imagePromptOptimizer";
import { chooseImageModel } from "./imageRouter";
import type { Scene } from "./gemini";

export interface ImageResult {
  paths: string[];
  cost: number;
}

export async function generateImages(scenes: Scene[]): Promise<ImageResult> {
  const imagesDir = path.resolve("./tmp/images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const paths: string[] = [];
  let totalCost = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prompt = optimizeImagePrompt(scene);

    console.log(`Generating image ${i + 1}/${scenes.length} using flux`);

    const imageBuffer = await callFlux(prompt);

    const imagePath = path.join(imagesDir, `scene_${i}.png`);
    fs.writeFileSync(imagePath, imageBuffer);
    paths.push(imagePath);

    // Approximate cost per image — adjust based on actual provider pricing
    totalCost += 0.01;
  }

  console.log(`Images generated: ${paths.length} files | est. cost: €${totalCost.toFixed(2)}`);

  return { paths, cost: totalCost };
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

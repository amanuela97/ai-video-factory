import { SupabaseClient } from "@supabase/supabase-js";
import { generateScript } from "./gemini";
import { generateVoice } from "./voice";
import { generateImages } from "./images";
import { renderScenes, concatScenes } from "./render";
import { uploadToBlob } from "./upload";
import { sendVideoReady } from "./whatsapp";
import { retry } from "./retry";
import { trackCost } from "../lib/cost";
import { generateThumbnail, pickThumbnailScene } from "./thumbnail";

// Main pipeline orchestrator — called by the worker for each queued job.
// Executes all pipeline steps in sequence, with retry on each step.
// markJob is injected from index.ts to update job status in Supabase.
export async function processJob(
  job: {
    id: string;
    video_id: string;
    input_topic: string;
    input_duration: number;
    user_phone: string;
  },
  supabase: SupabaseClient,
  markJob: (jobId: string, status: string, error?: string) => Promise<void>
) {
  const videoId = job.video_id;

  // ── STEP 1: Generate script via Gemini ──────────────────────────────────
  console.log("Step 1: Generating script...");
  const script = await retry(
    () => generateScript({ topic: job.input_topic, duration: job.input_duration }),
    3,
    "gemini-script"
  );
  await trackCost(supabase, {
    videoId,
    service: "gemini",
    model: "gemini-1.5-flash",
    cost: script.cost,
  });

  // ── STEP 2: Generate voice via ElevenLabs ───────────────────────────────
  await markJob(job.id, "generating_voice");
  console.log("Step 2: Generating voice...");
  const voice = await retry(
    () => generateVoice(script),
    3,
    "elevenlabs-voice"
  );
  await trackCost(supabase, {
    videoId,
    service: "elevenlabs",
    model: "eleven_monolingual_v1",
    cost: voice.cost,
    metadata: { chars: script.scenes.map((s) => s.narration).join(" ").length },
  });

  // ── STEP 3: Generate images ─────────────────────────────────────────────
  await markJob(job.id, "generating_images");
  console.log("Step 3: Generating images...");
  const { paths: imagePaths, cost: imageCost } = await retry(
    () => generateImages(script.scenes),
    3,
    "image-generation"
  );
  await trackCost(supabase, {
    videoId,
    service: "images",
    cost: imageCost,
    metadata: { scene_count: script.scenes.length },
  });

  // Attach local file paths to scenes for rendering
  const sceneAssets = script.scenes.map((scene, i) => ({
    ...scene,
    imagePath: imagePaths[i],
    fullAudioPath: voice.fullAudioPath,
  }));

  // ── STEP 4: Generate thumbnail ──────────────────────────────────────────
  console.log("Step 4: Generating thumbnail...");
  const thumbnailScene = pickThumbnailScene(script.scenes);
  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = await retry(
      () => generateThumbnail(thumbnailScene),
      2,
      "thumbnail-generation"
    );
  } catch (err) {
    console.warn("Thumbnail generation failed (non-fatal):", err);
  }

  // ── STEP 5: Render video with FFmpeg ────────────────────────────────────
  await markJob(job.id, "rendering");
  console.log("Step 5: Rendering video...");
  const sceneFiles = await renderScenes(sceneAssets);
  const finalVideoPath = await concatScenes(sceneFiles);

  // ── STEP 6: Upload to Vercel Blob ───────────────────────────────────────
  await markJob(job.id, "uploading");
  console.log("Step 6: Uploading to Vercel Blob...");
  const blobUrl = await uploadToBlob(finalVideoPath);

  // ── STEP 7: Save final metadata to Supabase ─────────────────────────────
  console.log("Step 7: Saving metadata...");
  const { data: video, error: updateError } = await supabase
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

  if (updateError) {
    throw new Error(`Failed to update video record: ${updateError.message}`);
  }

  // ── STEP 8: Send WhatsApp notification ──────────────────────────────────
  console.log("Step 8: Sending WhatsApp notification...");
  await sendVideoReady(job.user_phone, {
    title: video.title,
    duration_seconds: video.duration_seconds,
    total_cost: Number(video.total_cost),
    blob_url: video.blob_url,
    scene_count: video.scene_count,
  });

  console.log(`Pipeline complete for video: ${videoId}`);
}

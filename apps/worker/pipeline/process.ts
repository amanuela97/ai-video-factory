import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { generateScript, type Script } from "./gemini";
import { generateVoice } from "./voice";
import { generateImages } from "./images";
import { renderScenes, concatScenes } from "./render";
import { uploadToBlob } from "./upload";
import { sendVideoReady } from "./whatsapp";
import { retry } from "./retry";
import { trackCost } from "../lib/cost";
import { generateThumbnail, pickThumbnailScene } from "./thumbnail";
import { hashKey, getCached, setCached, downloadToFile } from "../lib/cache";

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

  // ── STEP 1: Generate script via Gemini (cached) ──────────────────────────
  console.log("Step 1: Generating script...");
  const scriptKey = hashKey(job.input_topic, String(job.input_duration));
  let script = await getCached<Script>(supabase, "script", scriptKey);

  if (script) {
    console.log("Step 1: Cache hit — reusing script");
  } else {
    script = await retry(
      () => generateScript({ topic: job.input_topic, duration: job.input_duration }),
      3,
      "gemini-script"
    );
    await setCached(supabase, "script", scriptKey, script);
    await trackCost(supabase, {
      videoId,
      service: "gemini",
      model: "gemini-2.5-flash",
      cost: script.cost,
    });
  }

  // ── STEP 2: Generate voice via ElevenLabs (cached) ───────────────────────
  await markJob(job.id, "generating_voice");
  console.log("Step 2: Generating voice...");
  const narrationText = script.scenes.map((s) => s.narration).join("|");
  const voiceKey = hashKey(narrationText, process.env.ELEVENLABS_VOICE_ID || "default");

  type VoiceCacheEntry = { blobUrl: string; cost: number };
  const cachedVoice = await getCached<VoiceCacheEntry>(supabase, "voice", voiceKey);

  let fullAudioPath: string;
  if (cachedVoice) {
    console.log("Step 2: Cache hit — reusing voice audio");
    fullAudioPath = path.resolve("./tmp/narration_full.mp3");
    await downloadToFile(cachedVoice.blobUrl, fullAudioPath);
  } else {
    const voice = await retry(() => generateVoice(script), 3, "elevenlabs-voice");
    fullAudioPath = voice.fullAudioPath;
    const audioBlobUrl = await uploadToBlob(fullAudioPath);
    await setCached(supabase, "voice", voiceKey, { blobUrl: audioBlobUrl, cost: voice.cost });
    await trackCost(supabase, {
      videoId,
      service: "elevenlabs",
      model: "eleven_monolingual_v1",
      cost: voice.cost,
      metadata: { chars: narrationText.length },
    });
  }

  // ── STEP 3: Generate images (cached per scene) ───────────────────────────
  await markJob(job.id, "generating_images");
  console.log("Step 3: Generating images...");
  const { paths: imagePaths, cost: imageCost } = await retry(
    () => generateImages(script.scenes, supabase),
    3,
    "image-generation"
  );
  if (imageCost > 0) {
    await trackCost(supabase, {
      videoId,
      service: "images",
      cost: imageCost,
      metadata: { scene_count: script.scenes.length },
    });
  }

  // Attach local file paths to scenes for rendering
  const sceneAssets = script.scenes.map((scene, i) => ({
    ...scene,
    imagePath: imagePaths[i],
    fullAudioPath,
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

  // ── STEP 8: Send WhatsApp notification (non-fatal) ──────────────────────
  console.log("Step 8: Sending WhatsApp notification...");
  try {
    await sendVideoReady(job.user_phone, {
      title: video.title,
      duration_seconds: video.duration_seconds,
      total_cost: Number(video.total_cost),
      blob_url: video.blob_url,
      scene_count: video.scene_count,
    });
  } catch (notifyErr) {
    console.warn("WhatsApp notification failed (non-fatal):", notifyErr instanceof Error ? notifyErr.message : notifyErr);
  }

  console.log(`Pipeline complete for video: ${videoId}`);
}

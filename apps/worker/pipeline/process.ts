import fs from "fs";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { generateScript, type Script } from "./gemini";
import { cleanNarration, generateSceneAudio } from "./voice";
import { generateImages } from "./images";
import { renderScenes, renderOutro, concatScenes } from "./render";
import { uploadToBlob } from "./upload";
import { sendVideoReady } from "./whatsapp";
import { retry } from "./retry";
import { trackCost } from "../lib/cost";
import { generateThumbnail, pickThumbnailScene } from "./thumbnail";
import { hashKey, getCached, setCached, downloadToFile } from "../lib/cache";

const OUTRO_SCRIPT =
  "If you enjoyed this video, please subscribe to this channel. This has been ByteForge, and I will see you in the next one.";

// Returns a path to outro.mp4 — generates + caches on first call, reuses on all subsequent calls.
async function getOrCreateOutro(supabase: SupabaseClient): Promise<string> {
  const outroPath = path.resolve("./tmp/scenes/outro.mp4");
  const outroCacheKey = hashKey(
    OUTRO_SCRIPT,
    process.env.ELEVENLABS_VOICE_ID || "default",
    "v1"
  );

  const cached = await getCached<{ blobUrl: string }>(supabase, "outro", outroCacheKey);
  if (cached) {
    console.log("Outro cache HIT — reusing cached outro");
    await downloadToFile(cached.blobUrl, outroPath);
    return outroPath;
  }

  console.log("Outro not cached — generating voiceover and rendering...");

  const outroAudioPath = path.resolve("./tmp/audio/outro.mp3");
  fs.mkdirSync(path.dirname(outroAudioPath), { recursive: true });

  await retry(
    () => generateSceneAudio(OUTRO_SCRIPT, outroAudioPath),
    3,
    "elevenlabs-outro"
  );

  // Logo lives at apps/worker/assets/logo.png — traverse up from dist/pipeline/
  // Falls back to no logo if the file wasn't committed to git yet.
  const logoPath = path.join(__dirname, "../../assets/logo.png");
  const hasLogo = fs.existsSync(logoPath);
  if (!hasLogo) {
    console.warn("Outro logo not found at", logoPath, "— rendering without logo");
  }

  const renderedPath = await renderOutro(outroAudioPath, hasLogo ? logoPath : null);

  try {
    const blobUrl = await uploadToBlob(renderedPath);
    await setCached(supabase, "outro", outroCacheKey, { blobUrl });
    console.log(`Outro cached: ${blobUrl}`);
  } catch (err) {
    console.warn("Outro cache write failed (non-fatal):", err);
  }

  return renderedPath;
}

type VideoCacheEntry = {
  blobUrl: string;
  thumbnailUrl: string | null;
  title: string;
  sceneCount: number;
};

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
  const videoKey = hashKey(job.input_topic, String(job.input_duration));

  // ── VIDEO CACHE CHECK — skip all API calls if this topic+duration was already rendered ──
  console.log(`Checking video cache (key: ${videoKey})...`);
  const cachedVideo = await getCached<VideoCacheEntry>(supabase, "video", videoKey);
  if (cachedVideo) {
    console.log("Video cache HIT — reusing rendered video, skipping pipeline");
    await supabase
      .from("videos")
      .update({
        blob_url: cachedVideo.blobUrl,
        thumbnail_url: cachedVideo.thumbnailUrl,
        status: "done",
        scene_count: cachedVideo.sceneCount,
        title: cachedVideo.title,
      })
      .eq("id", videoId);

    await markJob(job.id, "done");

    try {
      await sendVideoReady(job.user_phone, {
        videoId,
        title: cachedVideo.title,
        duration_seconds: job.input_duration,
        total_cost: 0,
        blob_url: cachedVideo.blobUrl,
        scene_count: cachedVideo.sceneCount,
      });
    } catch (err) {
      console.warn("WhatsApp notification failed (non-fatal):", err instanceof Error ? err.message : err);
    }
    return;
  }

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

  // ── STEP 2: Generate per-scene voice audio (cached per scene) ───────────
  await markJob(job.id, "generating_voice");
  console.log("Step 2: Generating voice...");

  const audioDir = path.resolve("./tmp/audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const audioPaths: string[] = [];
  let voiceTotalCost = 0;

  for (let i = 0; i < script.scenes.length; i++) {
    const cleaned = cleanNarration(script.scenes[i].narration);
    const voiceKey = hashKey(cleaned, process.env.ELEVENLABS_VOICE_ID || "default");
    const audioPath = path.join(audioDir, `scene_${i}.mp3`);

    const cached = await getCached<{ blobUrl: string }>(supabase, "voice", voiceKey);
    if (cached) {
      console.log(`Voice scene ${i + 1}/${script.scenes.length}: Cache hit`);
      await downloadToFile(cached.blobUrl, audioPath);
    } else {
      await retry(
        () => generateSceneAudio(cleaned, audioPath),
        3,
        `elevenlabs-scene-${i}`
      );
      const blobUrl = await uploadToBlob(audioPath);
      await setCached(supabase, "voice", voiceKey, { blobUrl });
      voiceTotalCost += (cleaned.length / 1000) * 0.3;
    }

    audioPaths.push(audioPath);
  }

  if (voiceTotalCost > 0) {
    await trackCost(supabase, {
      videoId,
      service: "elevenlabs",
      model: "eleven_monolingual_v1",
      cost: voiceTotalCost,
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

  const sceneAssets = script.scenes.map((scene, i) => ({
    ...scene,
    imagePath: imagePaths[i],
    audioPath: audioPaths[i],
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
  const outroPath = await getOrCreateOutro(supabase);
  const finalVideoPath = await concatScenes([...sceneFiles, outroPath]);

  // ── STEP 6: Upload to Vercel Blob ───────────────────────────────────────
  await markJob(job.id, "uploading");
  console.log("Step 6: Uploading to Vercel Blob...");
  const blobUrl = await uploadToBlob(finalVideoPath);

  // Cache the final rendered video so the same topic+duration never re-renders
  const videoEntry: VideoCacheEntry = {
    blobUrl,
    thumbnailUrl,
    title: script.title,
    sceneCount: script.scenes.length,
  };
  await setCached(supabase, "video", videoKey, videoEntry);
  console.log(`Video cached (key: ${videoKey})`);

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

  // ── STEP 8: Send WhatsApp notification with Upload/Cancel buttons ────────
  console.log("Step 8: Sending WhatsApp notification...");
  try {
    await sendVideoReady(job.user_phone, {
      videoId,
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

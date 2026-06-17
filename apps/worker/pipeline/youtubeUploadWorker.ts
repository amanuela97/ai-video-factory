import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadToYouTube, checkYouTubeDuplicate } from "./youtube";
import { sendWhatsAppMessage, sendInteractiveButtons } from "./whatsapp";
import { downloadToFile } from "../lib/cache";

// Processes one pending YouTube upload per call.
// Called from the main worker loop alongside the video job queue.
export async function processYouTubeUploadQueue(supabase: SupabaseClient): Promise<void> {
  const { data: upload } = await supabase
    .from("youtube_uploads")
    .select("*")
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!upload) return;

  // Claim it immediately to prevent double-processing on restart
  await supabase
    .from("youtube_uploads")
    .update({ status: "uploading" })
    .eq("id", upload.id)
    .eq("status", upload.status); // optimistic lock

  try {
    if (upload.status === "pending") {
      // Check for a duplicate on the channel before uploading
      console.log(`YouTube upload ${upload.id}: checking for duplicates...`);
      const duplicate = await checkYouTubeDuplicate(upload.title);

      if (duplicate) {
        console.log(`Duplicate found: "${duplicate}" — awaiting user confirmation`);
        await supabase
          .from("youtube_uploads")
          .update({ status: "awaiting_confirmation" })
          .eq("id", upload.id);

        await sendInteractiveButtons({
          to: upload.user_phone,
          body: `⚠️ Similar video already on your channel:\n"${duplicate}"\n\nUpload anyway?`,
          buttons: [
            { id: `confirm_upload_${upload.id}`, title: "Upload Anyway" },
            { id: `cancel_upload_${upload.id}`, title: "Cancel" },
          ],
        });
        return;
      }
    }

    // No duplicate (or user confirmed) — download and upload
    console.log(`YouTube upload ${upload.id}: downloading from Blob...`);
    const tmpPath = path.resolve(`./tmp/yt_${upload.id}.mp4`);
    await downloadToFile(upload.blob_url, tmpPath);

    console.log(`YouTube upload ${upload.id}: uploading to YouTube...`);
    const result = await uploadToYouTube({
      filePath: tmpPath,
      title: upload.title,
    });

    await supabase
      .from("youtube_uploads")
      .update({ status: "done", youtube_url: result.url })
      .eq("id", upload.id);

    await sendWhatsAppMessage({
      to: upload.user_phone,
      message: `✅ Uploaded to YouTube!\n\n▶ Watch: ${result.url}`,
    });

    fs.unlinkSync(tmpPath);
    console.log(`YouTube upload ${upload.id}: done — ${result.url}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`YouTube upload ${upload.id} failed:`, err);

    await supabase
      .from("youtube_uploads")
      .update({ status: "failed", error: message })
      .eq("id", upload.id);

    await sendWhatsAppMessage({
      to: upload.user_phone,
      message: `❌ YouTube upload failed.\n\nError: ${message}`,
    });
  }
}

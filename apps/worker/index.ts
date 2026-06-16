import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { processJob } from "./pipeline/process";

if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws as any } }
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

// On worker restart: reset any jobs stuck mid-pipeline back to queued
// This prevents permanently stuck jobs when the worker crashes mid-run
async function resetStuckJobs() {
  const stuckStatuses = [
    "generating_script",
    "generating_voice",
    "generating_images",
    "rendering",
    "uploading",
  ];

  for (const status of stuckStatuses) {
    const { count } = await supabase
      .from("jobs")
      .update({ status: "queued", error: null }, { count: "exact" })
      .eq("status", status);

    if (count && count > 0) {
      console.log(`Reset ${count} stuck job(s) from status: ${status} → queued`);
    }
  }
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

    console.log(`Processing job: ${job.id} | topic: "${job.input_topic}"`);

    try {
      await markJob(job.id, "generating_script");
      await processJob(job, supabase, markJob);
      await markJob(job.id, "done");
      console.log(`Job complete: ${job.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Job failed: ${job.id}`, err);
      await markJob(job.id, "failed", message);

      // Send failure notification via WhatsApp (skip for debug/non-phone values)
      if (job.user_phone && job.user_phone.startsWith("+")) {
        try {
          const { sendWhatsAppMessage } = await import("./pipeline/whatsapp");
          await sendWhatsAppMessage({
            to: job.user_phone,
            message: `❌ Video generation failed.\n\nTopic: ${job.input_topic}\nError: ${message}`,
          });
        } catch (notifyErr) {
          console.error("Failed to send WhatsApp failure notification:", notifyErr);
        }
      }
    }
  }
}

run();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

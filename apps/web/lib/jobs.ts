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
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .insert({
      title: topic,
      topic,
      duration_seconds: durationSeconds,
      status: "queued",
    })
    .select()
    .single();

  if (videoError || !video) {
    throw new Error(`Failed to create video record: ${videoError?.message}`);
  }

  const { data: job, error: jobError } = await supabase
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

  if (jobError || !job) {
    throw new Error(`Failed to create job record: ${jobError?.message}`);
  }

  return job;
}

export async function getJobStatus(jobId: string) {
  const { data } = await supabase
    .from("jobs")
    .select("*, videos(*)")
    .eq("id", jobId)
    .single();
  return data;
}

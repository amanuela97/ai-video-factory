import { SupabaseClient } from "@supabase/supabase-js";

export async function trackCost(
  supabase: SupabaseClient,
  {
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
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("usage_events").insert({
    video_id: videoId,
    service,
    model,
    cost,
    metadata,
  });

  // Recalculate running total and update videos record
  const { data } = await supabase
    .from("usage_events")
    .select("cost")
    .eq("video_id", videoId);

  const total = data?.reduce((sum, e) => sum + Number(e.cost), 0) ?? 0;

  await supabase
    .from("videos")
    .update({ total_cost: total })
    .eq("id", videoId);

  console.log(`Cost tracked: ${service} €${cost.toFixed(4)} | video total: €${total.toFixed(4)}`);
}

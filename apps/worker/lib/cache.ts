import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hashKey(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export async function getCached<T>(
  supabase: SupabaseClient,
  step: string,
  key: string
): Promise<T | null> {
  try {
    const { data } = await supabase
      .from("pipeline_cache")
      .select("data")
      .eq("cache_key", `${step}:${key}`)
      .maybeSingle();
    return data ? (data.data as T) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(
  supabase: SupabaseClient,
  step: string,
  key: string,
  value: T
): Promise<void> {
  const { error } = await supabase
    .from("pipeline_cache")
    .upsert(
      { cache_key: `${step}:${key}`, step, data: value },
      { onConflict: "cache_key" }
    );
  if (error) {
    console.warn(`Cache write failed for ${step}:${key}:`, error.message);
  }
}

// Downloads a remote URL to a local file path, creating parent dirs as needed
export async function downloadToFile(url: string, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60_000 });
  fs.writeFileSync(destPath, Buffer.from(res.data));
}

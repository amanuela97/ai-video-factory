import axios from "axios";
import fs from "fs";
import path from "path";
import type { Scene } from "./gemini";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
// Default: "Rachel" voice — calm, educational tone
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

export interface VoiceResult {
  fullAudioPath: string;
  cost: number;
}

export async function generateVoice(script: { scenes: Scene[] }): Promise<VoiceResult> {
  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");

  // Concatenate all scene narrations into a single narration track.
  // Scenes are separated by a short pause to ensure natural pacing.
  const fullNarration = script.scenes
    .map((s) => s.narration.trim())
    .join(" ... ");

  console.log(
    `Generating voice for ${script.scenes.length} scenes (${fullNarration.length} chars)`
  );

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      text: fullNarration,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    }
  );

  // Ensure tmp directory exists
  const tmpDir = path.resolve("./tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const fullAudioPath = path.join(tmpDir, "narration_full.mp3");
  fs.writeFileSync(fullAudioPath, Buffer.from(response.data));

  // ElevenLabs Starter plan: ~$0.30 per 1000 characters
  const cost = (fullNarration.length / 1000) * 0.3;

  console.log(
    `Voice generated: ${fullAudioPath} | est. cost: €${cost.toFixed(3)}`
  );

  return { fullAudioPath, cost };
}

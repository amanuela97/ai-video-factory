import axios from "axios";
import fs from "fs";
import path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// Strips markdown formatting characters that TTS reads aloud literally.
// e.g. *stuff* → stuff, **bold** → bold, _italic_ → italic
export function cleanNarration(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Generates ElevenLabs TTS audio for a single cleaned narration string
// and writes it to the given output path.
export async function generateSceneAudio(
  narration: string,
  outputPath: string
): Promise<void> {
  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      text: narration,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(response.data));
}

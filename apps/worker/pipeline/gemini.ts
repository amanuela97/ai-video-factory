import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildGeminiPrompt } from "./prompts/geminiPrompt";

if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export interface Scene {
  start: number;
  end: number;
  narration: string;
  visual_prompt: string;
  curiosity_hook: string;
  retention_reason: string;
}

export interface Script {
  title: string;
  duration_seconds: number;
  scenes: Scene[];
  cost: number;
}

export async function generateScript({
  topic,
  duration,
}: {
  topic: string;
  duration: number;
}): Promise<Script> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = buildGeminiPrompt(topic, duration);

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim();

  // Strip markdown code fences if Gemini wraps output despite instructions
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let json: Omit<Script, "cost">;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Gemini returned invalid JSON. First 300 chars: ${rawText.slice(0, 300)}`
    );
  }

  // Validate required structure
  if (!json.scenes || !Array.isArray(json.scenes) || json.scenes.length === 0) {
    throw new Error("Gemini output missing scenes array");
  }

  // Validate scene coverage — last scene should end at the target duration
  const lastScene = json.scenes[json.scenes.length - 1];
  if (lastScene.end < duration - 2) {
    throw new Error(
      `Gemini scenes only cover ${lastScene.end}s of required ${duration}s`
    );
  }

  const cost = estimateGeminiCost(rawText);

  console.log(
    `Script generated: "${json.title}" | ${json.scenes.length} scenes | est. cost: €${cost.toFixed(4)}`
  );

  return { ...json, cost };
}

// Rough cost estimate: Gemini Flash ~$0.075/1M input tokens, $0.30/1M output tokens
// Using a conservative estimate of $0.0000005 per character output
function estimateGeminiCost(output: string): number {
  const tokens = output.length / 4;
  return tokens * 0.0000005;
}

import { IMAGE_STYLE_PREFIX, IMAGE_STYLE_FORBIDDEN } from "../../../packages/prompts/systemStyle";

export interface SceneForImage {
  visual_prompt: string;
  narration: string;
}

// The "style firewall" — wraps every visual_prompt from Gemini in strict style enforcement.
// This is the second layer of style control (Gemini's prompt is the first layer).
// Double enforcement prevents image models from "upgrading" the art style toward realism.
export function optimizeImagePrompt(scene: SceneForImage): string {
  return `ABSOLUTE STYLE LOCK — MS Paint doodle ONLY.

${IMAGE_STYLE_PREFIX}

REQUIRED:
- childish stick figures with thick wobbly black outlines
- exaggerated simplicity
- simple shapes only (circles, squares, lines)
- large empty whitespace

${IMAGE_STYLE_FORBIDDEN}

SCENE TO DRAW:
${scene.visual_prompt}`;
}

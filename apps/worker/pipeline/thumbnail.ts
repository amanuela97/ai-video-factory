import { generateImages } from "./images";
import { uploadToBlob } from "./upload";
import type { Scene } from "./gemini";

// Scores each scene to find the highest-impact one for the thumbnail.
// Prioritizes scenes with curiosity hooks, contrast/problem framing, or questions.
export function pickThumbnailScene(scenes: Scene[]): Scene {
  const scored = scenes.map((scene) => {
    let score = 0;

    // Scenes with strong curiosity hooks score highest
    score += (scene.curiosity_hook?.length ?? 0) * 0.5;

    // Scenes that mention problem/contrast/shock themes score well
    const vp = scene.visual_prompt.toLowerCase();
    if (vp.includes("problem")) score += 15;
    if (vp.includes("contrast")) score += 10;
    if (vp.includes("shock")) score += 12;
    if (vp.includes("surprise")) score += 10;
    if (vp.includes("wrong")) score += 8;
    if (vp.includes("fail")) score += 8;

    // Narration with questions signals curiosity-gap scenes
    if (scene.narration.includes("?")) score += 10;

    return { scene, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].scene;
}

// Generates a YouTube thumbnail for the given scene.
// Uses a specialized thumbnail prompt to maximize curiosity and CTR.
export async function generateThumbnail(scene: Scene): Promise<string> {
  const thumbnailPrompt = `MS Paint style YouTube thumbnail. 16:9 widescreen.

RULES:
- VERY exaggerated stick figure emotion (shock, excitement, curiosity)
- Bold simple shapes
- High contrast flat colors (red, yellow, black, white)
- Minimal text if any (1-4 words MAXIMUM, large font)
- Empty space for text overlay
- Make viewer ask "what is happening?"

SCENE:
${scene.visual_prompt}

STYLE (HARD LOCK):
- childish doodle, MS Paint aesthetic
- thick wobbly outlines
- flat colors only
- white background
- NO realism, NO gradients, NO 3D

FORBIDDEN: detailed art, anime, photorealism, shadows.`;

  // Reuse the image generation pipeline with a custom prompt
  const { paths } = await generateImages([
    { ...scene, visual_prompt: thumbnailPrompt },
  ]);

  // Upload thumbnail to Vercel Blob and return URL
  const thumbnailUrl = await uploadToBlob(paths[0]);
  return thumbnailUrl;
}

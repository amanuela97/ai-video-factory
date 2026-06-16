export type ImageModel = "nano-banana" | "flux";

// Routes each scene to the best image model based on content type.
// Nano Banana: better for childish/cartoon/character style (our default)
// FLUX: better for abstract scenes like charts, diagrams, backgrounds
export function chooseImageModel(scene: { visual_prompt: string }): ImageModel {
  const text = scene.visual_prompt.toLowerCase();

  const isCharacterScene =
    text.includes("stick") ||
    text.includes("figure") ||
    text.includes("person") ||
    text.includes("man") ||
    text.includes("woman") ||
    text.includes("child") ||
    text.includes("character") ||
    text.includes("walking") ||
    text.includes("pointing") ||
    text.includes("holding");

  const isAbstractScene =
    text.includes("graph") ||
    text.includes("chart") ||
    text.includes("diagram") ||
    text.includes("background") ||
    text.includes("map") ||
    text.includes("grid") ||
    text.includes("timeline");

  // If a scene has both, character rendering takes priority for style consistency
  if (isCharacterScene) return "nano-banana";
  if (isAbstractScene) return "flux";

  // Default: nano-banana — better at preserving childish/doodle aesthetic
  return "nano-banana";
}

export type ImageModel = "flux";

export function chooseImageModel(_scene: { visual_prompt: string }): ImageModel {
  return "flux";
}

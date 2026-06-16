import { put } from "@vercel/blob";

export async function uploadToBlob(
  filename: string,
  fileBuffer: Buffer
): Promise<string> {
  const result = await put(filename, fileBuffer, { access: "public" });
  return result.url;
}

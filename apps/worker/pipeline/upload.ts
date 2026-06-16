import { put } from "@vercel/blob";
import fs from "fs";
import path from "path";

// Uploads a local file to Vercel Blob and returns the public URL
export async function uploadToBlob(filePath: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN");
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath); // .mp4 or .png
  const filename = `video-factory/${Date.now()}${ext}`;

  console.log(`Uploading ${path.basename(filePath)} to Vercel Blob...`);

  const result = await put(filename, fileBuffer, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  console.log(`Uploaded: ${result.url}`);

  return result.url;
}

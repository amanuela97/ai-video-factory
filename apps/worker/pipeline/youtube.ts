import { google } from "googleapis";
import fs from "fs";

// YouTube Data API v3 upload
// Prerequisites:
//   1. Google Cloud Project with YouTube Data API v3 enabled
//   2. OAuth2 client credentials (web application type)
//   3. Refresh token obtained via one-time manual OAuth flow
//
// To obtain refresh token, run the oauth-setup.ts helper script once.

export interface YouTubeUploadOptions {
  filePath: string;        // local path to final.mp4
  title: string;           // video title (from script)
  description?: string;    // auto-generated description
  thumbnailPath?: string;  // local path to thumbnail PNG
  publishAt?: string;      // ISO 8601 schedule: "2026-06-15T18:00:00Z" (optional)
}

export async function uploadToYouTube(options: YouTubeUploadOptions) {
  const { filePath, title, description = "", thumbnailPath, publishAt } = options;

  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REFRESH_TOKEN
  ) {
    throw new Error(
      "Missing YouTube OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT || "http://localhost:3000/oauth/callback"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  console.log(`Uploading to YouTube: "${title}"`);

  const videoRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description: description || `Educational video: ${title}\n\nGenerated automatically.`,
        categoryId: "27", // 27 = Education
        tags: ["education", "explainer", "animated"],
      },
      status: {
        // If publishAt is set, upload as private and schedule publication.
        // If not set, upload as unlisted (accessible via link).
        privacyStatus: publishAt ? "private" : "unlisted",
        ...(publishAt ? { publishAt } : {}),
      },
    },
    media: {
      mimeType: "video/mp4",
      body: fs.createReadStream(filePath),
    },
  });

  const videoId = videoRes.data.id;

  if (!videoId) throw new Error("YouTube upload returned no video ID");

  console.log(`YouTube upload complete: https://youtu.be/${videoId}`);

  // Upload thumbnail if provided
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    console.log("Setting YouTube thumbnail...");
    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: "image/png",
        body: fs.createReadStream(thumbnailPath),
      },
    });
    console.log("Thumbnail set.");
  }

  return {
    videoId,
    url: `https://youtu.be/${videoId}`,
    data: videoRes.data,
  };
}

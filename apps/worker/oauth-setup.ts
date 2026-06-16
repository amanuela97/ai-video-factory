// One-time OAuth flow helper to get the Google refresh token.
// Run this script once: npx ts-node oauth-setup.ts
// Then copy the refresh_token into your .env file as GOOGLE_REFRESH_TOKEN

import { google } from "googleapis";
import * as readline from "readline";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/oauth/callback"
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n=== YouTube OAuth Setup ===\n");
console.log("1. Open this URL in your browser:");
console.log(authUrl);
console.log("\n2. After approving, copy the authorization code from the redirect URL.");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("\n3. Paste the code here: ", async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log("\n=== Your Refresh Token ===");
  console.log(tokens.refresh_token);
  console.log("\nAdd to .env: GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
  rl.close();
});

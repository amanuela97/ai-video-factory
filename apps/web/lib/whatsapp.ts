import axios from "axios";

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID!;

export async function sendWhatsAppMessage({
  to,
  message,
}: {
  to: string;
  message: string;
}) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }
  );
}

export async function sendVideoReady(
  to: string,
  video: {
    title: string;
    duration_seconds: number;
    total_cost: number;
    blob_url: string;
    scene_count: number;
  }
) {
  const minutes = Math.floor(video.duration_seconds / 60);
  const seconds = video.duration_seconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  const msg = [
    "🎬 Video Ready",
    "",
    `Title: ${video.title}`,
    `Duration: ${minutes}:${paddedSeconds}`,
    `Scenes: ${video.scene_count}`,
    "",
    `💰 Cost: €${video.total_cost.toFixed(2)}`,
    "",
    "▶️ Watch:",
    video.blob_url,
  ].join("\n");

  await sendWhatsAppMessage({ to, message: msg });
}

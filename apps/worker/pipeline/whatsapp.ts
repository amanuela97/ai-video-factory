import axios from "axios";

// Worker-side WhatsApp sender (mirrors the web lib version for use in Railway)
export async function sendWhatsAppMessage({
  to,
  message,
}: {
  to: string;
  message: string;
}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.warn("WhatsApp credentials missing — skipping notification");
    return;
  }

  await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: { Authorization: `Bearer ${token}` },
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

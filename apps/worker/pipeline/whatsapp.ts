import axios from "axios";

// WhatsApp API requires phone numbers without +, spaces, or dashes.
// e.g. "+358 413 116889" → "358413116889"
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

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
      to: normalizePhone(to),
      type: "text",
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function sendInteractiveButtons({
  to,
  body,
  buttons,
}: {
  to: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.warn("WhatsApp credentials missing — skipping notification");
    return;
  }

  // WhatsApp allows max 3 reply buttons
  await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function sendVideoReady(
  to: string,
  video: {
    videoId: string;
    title: string;
    duration_seconds: number;
    total_cost: number;
    blob_url: string;
    scene_count: number;
  }
) {
  const minutes = Math.floor(video.duration_seconds / 60);
  const seconds = String(video.duration_seconds % 60).padStart(2, "0");

  const body = [
    "🎬 Video Ready",
    "",
    `Title: ${video.title}`,
    `Duration: ${minutes}:${seconds}`,
    `Scenes: ${video.scene_count}`,
    `Cost: €${video.total_cost.toFixed(2)}`,
    "",
    `▶ Watch: ${video.blob_url}`,
    "",
    "Upload to YouTube?",
  ].join("\n");

  await sendInteractiveButtons({
    to,
    body,
    buttons: [
      { id: `upload_${video.videoId}`, title: "Upload to YouTube" },
      { id: "cancel", title: "Cancel" },
    ],
  });
}

import axios from "axios";

// WhatsApp API requires phone numbers without +, spaces, or dashes.
// e.g. "+358 413 116889" → "358413116889"
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

function getCredentials() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error("WhatsApp credentials missing (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)");
  return { token, phoneId };
}

export async function sendWhatsAppMessage({
  to,
  message,
}: {
  to: string;
  message: string;
}) {
  const { token, phoneId } = getCredentials();

  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log(`WhatsApp text sent to ${normalizePhone(to)} — status: ${res.status}`);
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
  const { token, phoneId } = getCredentials();

  try {
    const res = await axios.post(
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
    console.log(`WhatsApp interactive sent to ${normalizePhone(to)} — status: ${res.status}`);
  } catch (err: unknown) {
    // Interactive messages require an open 24h conversation window.
    // If the window is closed, fall back to a plain text message so the
    // user always receives a notification.
    const apiError = (err as { response?: { data?: unknown } })?.response?.data;
    console.warn("Interactive message failed, falling back to plain text. API error:", JSON.stringify(apiError));
    await sendWhatsAppMessage({ to, message: body });
  }
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
  // Skip entirely for non-phone values used in testing (e.g. "debug")
  if (!to || !to.replace(/[\s\+]/g, "").match(/^\d{7,15}$/)) {
    console.log(`Skipping WhatsApp notification — "${to}" is not a valid phone number`);
    return;
  }

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

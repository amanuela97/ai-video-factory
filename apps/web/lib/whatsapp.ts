import axios from "axios";

const TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID!;

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
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
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
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
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
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

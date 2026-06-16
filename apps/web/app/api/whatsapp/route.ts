import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";

// WhatsApp Cloud API webhook verification (GET request from Meta)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Incoming WhatsApp message handler (POST from Meta)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
    const from =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;

    // Ignore non-text events (status updates, reactions, etc.)
    if (!message || !from) {
      return NextResponse.json({ ok: true });
    }

    // Expected format: "topic | duration"
    // Examples:
    //   "How inflation works | 5min"
    //   "Compound interest | 6"
    const parts = message.split("|");
    const topic = parts[0]?.trim();
    const durationRaw = parts[1]?.trim() ?? "5";
    const durationMinutes = parseInt(durationRaw.replace(/\D/g, "")) || 5;
    const durationSeconds = durationMinutes * 60;

    if (!topic) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const job = await createJob({ topic, durationSeconds, userPhone: from });

    console.log(`Job created: ${job.id} for topic: "${topic}" (${durationSeconds}s)`);

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

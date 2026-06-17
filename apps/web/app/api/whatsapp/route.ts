import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// WhatsApp Cloud API webhook verification (GET)
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
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return NextResponse.json({ ok: true });

    const from: string = msg.from;

    // ── Interactive button reply ──────────────────────────────────────────
    if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
      const buttonId: string = msg.interactive.button_reply.id;
      await handleButtonReply(from, buttonId);
      return NextResponse.json({ ok: true });
    }

    // ── Plain text message → create video job ─────────────────────────────
    if (msg.type === "text") {
      const text: string = msg.text?.body ?? "";
      const parts = text.split("|");
      const topic = parts[0]?.trim();
      const durationRaw = parts[1]?.trim() ?? "5";
      const durationMinutes = parseInt(durationRaw.replace(/\D/g, "")) || 5;
      const durationSeconds = durationMinutes * 60;

      if (!topic) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

      const job = await createJob({ topic, durationSeconds, userPhone: from });
      console.log(`Job created: ${job.id} for topic: "${topic}"`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

async function handleButtonReply(from: string, buttonId: string) {
  // ── Upload to YouTube ─────────────────────────────────────────────────
  if (buttonId.startsWith("upload_")) {
    const videoId = buttonId.replace("upload_", "");

    const { data: video } = await supabase
      .from("videos")
      .select("id, title, blob_url")
      .eq("id", videoId)
      .maybeSingle();

    if (!video?.blob_url) {
      await sendWhatsAppMessage({ to: from, message: "❌ Could not find the video. Please try again." });
      return;
    }

    await supabase.from("youtube_uploads").insert({
      video_id: videoId,
      user_phone: from,
      blob_url: video.blob_url,
      title: video.title,
      status: "pending",
    });

    await sendWhatsAppMessage({
      to: from,
      message: "⏳ Checking your channel for duplicates… I'll get back to you shortly.",
    });
    return;
  }

  // ── Confirm upload after duplicate warning ────────────────────────────
  if (buttonId.startsWith("confirm_upload_")) {
    const uploadId = buttonId.replace("confirm_upload_", "");

    await supabase
      .from("youtube_uploads")
      .update({ status: "confirmed" })
      .eq("id", uploadId);

    await sendWhatsAppMessage({ to: from, message: "✅ Got it! Starting upload now…" });
    return;
  }

  // ── Cancel upload ─────────────────────────────────────────────────────
  if (buttonId.startsWith("cancel_upload_")) {
    const uploadId = buttonId.replace("cancel_upload_", "");

    await supabase
      .from("youtube_uploads")
      .update({ status: "cancelled" })
      .eq("id", uploadId);

    await sendWhatsAppMessage({ to: from, message: "Upload cancelled." });
    return;
  }

  // Plain "cancel" from the initial video-ready message — do nothing
}

import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";

// Manual debug endpoint to trigger video generation without WhatsApp
// POST body: { "topic": "How inflation works", "durationMinutes": 5, "phone": "+1234567890" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, durationMinutes = 5, phone = "debug" } = body;

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const job = await createJob({
      topic,
      durationSeconds: durationMinutes * 60,
      userPhone: phone,
    });

    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (err) {
    console.error("Create job error:", err);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

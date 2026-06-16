import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/jobs";

// Poll job status — useful for debugging pipeline progress
// GET /api/webhook-status?jobId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const data = await getJobStatus(jobId);

  if (!data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

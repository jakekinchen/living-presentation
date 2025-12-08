import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";
import { getClientId, isRateLimited } from "@/utils/rateLimit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate session exists
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { text } = body;

    const clientKey = `${sessionId}:${getClientId(request)}`;
    if (isRateLimited(clientKey, 10, 60_000)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    // Validate feedback text
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 }
      );
    }

    // Add feedback to session
    const feedback = sessionStore.addFeedback(sessionId, text.trim());

    if (!feedback) {
      return NextResponse.json(
        { error: "Failed to add feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
    });
  } catch (error) {
    console.error("❌ Error submitting feedback:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

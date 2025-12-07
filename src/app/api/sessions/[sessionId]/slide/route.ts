import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

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
    const { slide, showQRCode, audienceUrl } = body;

    // Update current slide (can be null to clear)
    const success = sessionStore.updateCurrentSlide(sessionId, slide, showQRCode, audienceUrl);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update slide" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error updating slide:", error);
    return NextResponse.json(
      { error: "Failed to update slide" },
      { status: 500 }
    );
  }
}

export async function GET(
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

    // Get current slide and QR code state
    const slideData = sessionStore.getCurrentSlide(sessionId);

    // Return with default values if slideData is null (shouldn't happen if session was validated)
    return NextResponse.json(
      slideData ?? { slide: null, showQRCode: false, audienceUrl: null },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error getting slide:", error);
    return NextResponse.json(
      { error: "Failed to get slide" },
      { status: 500 }
    );
  }
}

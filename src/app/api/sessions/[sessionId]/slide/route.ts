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
    const { slide } = body;

    // Update current slide (can be null to clear)
    const success = sessionStore.updateCurrentSlide(sessionId, slide);

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

    // Get current slide
    const slide = sessionStore.getCurrentSlide(sessionId);

    return NextResponse.json({ slide });
  } catch (error) {
    console.error("❌ Error getting slide:", error);
    return NextResponse.json(
      { error: "Failed to get slide" },
      { status: 500 }
    );
  }
}

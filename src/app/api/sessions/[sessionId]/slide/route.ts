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

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== session.presenterToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (!slideData) {
      return NextResponse.json(
        { slide: null, showQRCode: false, audienceUrl: null, revision: 0 },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const clientRevision = request.nextUrl.searchParams.get("rev");
    if (clientRevision && Number(clientRevision) === slideData.revision) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Slide-Revision": String(slideData.revision),
        },
      });
    }

    return NextResponse.json(
      slideData,
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Slide-Revision": String(slideData.revision),
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

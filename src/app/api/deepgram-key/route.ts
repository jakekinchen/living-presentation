import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";
import { getClientId, isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";

// Hardcoded Deepgram project ID to avoid relying on DEEPGRAM_PROJECT_ID env var
const DEEPGRAM_PROJECT_ID = "551c34f3-7f28-46f5-a800-576627695ad0";

export async function GET(request: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    console.error("DEEPGRAM_API_KEY is not set");
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY environment variable" },
      { status: 500 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== session.presenterToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = `${sessionId}:${getClientId(request)}`;
  if (isRateLimited(clientKey, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const response = await fetch(
      `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: "Temporary client key for realtime streaming",
          time_to_live_in_seconds: 300, // 5 minutes
          // Minimum scopes needed for realtime listening from the browser
          scopes: ["usage:read", "usage:write", "listen:stream"],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("Deepgram key creation failed:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to create temporary Deepgram key" },
        { status: 500 }
      );
    }

    const data = await response.json();

    const key =
      (typeof data === "string" ? data : null) ||
      data?.key ||
      data?.api_key ||
      data?.apiKey ||
      data?.token ||
      data?.access_token;

    if (!key || typeof key !== "string") {
      console.error("Unexpected Deepgram key response shape:", data);
      return NextResponse.json(
        { error: "Failed to obtain temporary Deepgram key" },
        { status: 500 }
      );
    }

    return NextResponse.json({ key });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error while creating Deepgram key:", message, error);
    return NextResponse.json(
      { error: "Failed to create temporary Deepgram key" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

export async function POST() {
  try {
    const session = sessionStore.createSession();

    // Construct the audience URL (relative path)
    const audienceUrl = `/presentation/${session.id}`;

    return NextResponse.json({
      sessionId: session.id,
      presenterToken: session.presenterToken,
      audienceUrl,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("❌ Error creating session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

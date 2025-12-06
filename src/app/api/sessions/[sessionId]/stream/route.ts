import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

// Required for SSE on Vercel
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Validate session exists
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return new Response("Session not found or expired", { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let lastCheckTimestamp = new Date().toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      // Keep-alive ping every 15 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch (error) {
          console.error("❌ Error sending keepalive:", error);
          clearInterval(keepAliveInterval);
          clearInterval(pollInterval);
        }
      }, 15000);

      // Poll for new feedback every 2 seconds
      const pollInterval = setInterval(() => {
        try {
          // Check if session still exists
          const currentSession = sessionStore.getSession(sessionId);
          if (!currentSession) {
            console.log(`Session ${sessionId} expired, closing stream`);
            clearInterval(keepAliveInterval);
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // Get new feedback since last check
          const newFeedback = sessionStore.getFeedback(sessionId, lastCheckTimestamp);

          if (newFeedback.length > 0) {
            // Send each new feedback item
            for (const feedback of newFeedback) {
              const data = JSON.stringify({
                type: "feedback",
                payload: feedback,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            // Update last check timestamp to the most recent feedback
            lastCheckTimestamp = newFeedback[newFeedback.length - 1].timestamp;
          }
        } catch (error) {
          console.error("❌ Error polling feedback:", error);
          clearInterval(keepAliveInterval);
          clearInterval(pollInterval);
          try {
            controller.close();
          } catch (e) {
            // Stream already closed
          }
        }
      }, 2000);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        console.log(`Client disconnected from session ${sessionId}`);
        clearInterval(keepAliveInterval);
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch (e) {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import fetch from "cross-fetch";
import type { Readable } from "stream";

export const runtime = "nodejs";

// URL for the realtime streaming audio you would like to transcribe
const STREAM_URL = "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service";

interface DeepgramTranscriptData {
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
}

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return new Response("Missing DEEPGRAM_API_KEY", { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const deepgram = createClient(apiKey);

      const connection = deepgram.listen.live({
        model: "nova-3",
        language: "en-US",
        smart_format: true,
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        connection.on(LiveTranscriptionEvents.Close, () => {
          console.log("Deepgram connection closed.");
          controller.close();
        });

        connection.on(
          LiveTranscriptionEvents.Transcript,
          (data: DeepgramTranscriptData) => {
          const transcript =
            data?.channel?.alternatives?.[0]?.transcript ?? "";

          if (transcript) {
            console.log(transcript);
            const payload = `data: ${JSON.stringify({ transcript })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          }
        });

        connection.on(LiveTranscriptionEvents.Metadata, (data: unknown) => {
          console.log("Deepgram metadata:", data);
        });

        connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
          console.error("Deepgram error:", err);
          const payload = `event: error\ndata: ${JSON.stringify({
            message: String(err),
          })}\n\n`;
          controller.enqueue(encoder.encode(payload));
        });

        fetch(STREAM_URL)
          .then((r) => r.body as Readable | null)
          .then((res) => {
            if (!res) return;
            res.on("readable", () => {
              const chunk = res.read();
              if (chunk) {
                connection.send(chunk);
              }
            });
          })
          .catch((err) => {
            console.error("Error fetching audio stream:", err);
            const payload = `event: error\ndata: ${JSON.stringify({
              message: "Failed to fetch audio stream",
            })}\n\n`;
            controller.enqueue(encoder.encode(payload));
            controller.close();
          });
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

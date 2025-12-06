 "use client";

import { useCallback, useRef, useState } from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";

export interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
  originalIdea: {
    title: string;
    content: string;
    category: string;
  };
  timestamp: string;
  source?: "voice" | "question"; // Track where the slide came from
}

export function useRealtimeAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingSlides, setPendingSlides] = useState<SlideData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  type DeepgramLiveConnection = ReturnType<
    ReturnType<typeof createClient>["listen"]["live"]
  >;

  const connectionRef = useRef<DeepgramLiveConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastIdeaTextRef = useRef<string>("");

  const processIdea = useCallback(
    async (title: string, content: string, category: string) => {
      console.log("🎯 Processing idea:", { title, content, category });
      setIsProcessing(true);

      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Gemini response:", data);
          if (data.slide) {
            // Mark slide as voice-generated
            const slideWithSource = { ...data.slide, source: "voice" as const };
            setPendingSlides((prev) => [...prev, slideWithSource]);
          }
        } else {
          console.error("❌ Gemini API error:", await response.text());
        }
      } catch (err) {
        console.error("❌ Failed to generate slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const removeSlide = useCallback((id: string) => {
    setPendingSlides((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const start = useCallback(async () => {
    if (connectionRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_DEEPGRAM_API_KEY environment variable");
      return;
    }

    setError(null);

    const deepgram = createClient(apiKey);
    const connection = deepgram.listen.live({
      model: "nova-3",
      language: "en-US",
      smart_format: true,
    });

    connectionRef.current = connection;

    connection.on(LiveTranscriptionEvents.Open, async () => {
      console.log("🔌 Deepgram connection opened");
      setIsConnected(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        recorderRef.current = recorder;

        recorder.ondataavailable = async (event) => {
          if (!event.data || event.data.size === 0) return;
          const current = connectionRef.current;
          if (!current) return;

          try {
            const buffer = await event.data.arrayBuffer();
            current.send(buffer);
          } catch (err) {
            console.error("❌ Failed to send audio chunk to Deepgram:", err);
          }
        };

        recorder.start(250);
        setIsRecording(true);
      } catch (err) {
        console.error("❌ Microphone access denied or failed:", err);
        setError("Microphone access denied");
        connection.requestClose();
        connectionRef.current = null;
        setIsConnected(false);
      }
    });

    connection.on(
      LiveTranscriptionEvents.Transcript,
      (data: LiveTranscriptionEvent) => {
        const alt = data.channel.alternatives[0];
        const text = alt?.transcript?.trim();
        if (!text) return;

        // Show latest phrase in live transcript
        setTranscript(text);

        // When Deepgram marks the segment as final, treat it as an idea
        if ((data.is_final || data.speech_final) && text.length > 20) {
          if (text === lastIdeaTextRef.current) return;
          lastIdeaTextRef.current = text;

          const words = text.split(/\s+/);
          const title = words.slice(0, 6).join(" ");

          void processIdea(title, text, "concept");
        }
      }
    );

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error("❌ Deepgram connection error:", err);
      setError("Deepgram connection error");
      setIsConnected(false);
      setIsRecording(false);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("🔌 Deepgram connection closed");
      setIsConnected(false);
      setIsRecording(false);
    });
  }, [processIdea]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (connectionRef.current) {
      connectionRef.current.requestClose();
      connectionRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
    setTranscript("");
  }, []);

  const clearPending = useCallback(() => {
    setPendingSlides([]);
  }, []);

  const processFeedback = useCallback(
    async (feedbackId: string, questionText: string) => {
      console.log("🎯 Processing feedback:", { feedbackId, questionText });
      setIsProcessing(true);

      try {
        // Generate a Q&A slide: Question (bold) + AI-generated answer
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: questionText,
            content: `Generate a clear, concise answer to this question: ${questionText}`,
            category: "question",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Gemini Q&A response:", data);
          if (data.slide) {
            // Mark slide as question-generated
            const slideWithSource = { ...data.slide, source: "question" as const };
            setPendingSlides((prev) => [...prev, slideWithSource]);
          }
        } else {
          console.error("❌ Gemini API error:", await response.text());
        }
      } catch (err) {
        console.error("❌ Failed to generate Q&A slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  return {
    isConnected,
    isRecording,
    isProcessing,
    pendingSlides,
    error,
    transcript,
    start,
    stop,
    clearPending,
    removeSlide,
    processFeedback,
  };
}

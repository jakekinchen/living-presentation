"use client";

import { useCallback, useRef, useState } from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";

export type PresentationMode = "gated" | "stream-of-consciousness";

export interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
  visualDescription?: string;
  originalIdea: {
    title: string;
    content: string;
    category: string;
  };
  timestamp: string;
}

// Compact slide history entry for API context
export interface SlideHistoryEntry {
  id: string;
  headline: string;
  visualDescription: string;
  category: string;
}

interface SlideContent {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
  sourceTranscript: string;
}

export type SlideOptions = [SlideData | null, SlideData | null];

export function useRealtimeAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [slideOptions, setSlideOptions] = useState<SlideOptions>([null, null]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [fullTranscript, setFullTranscript] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<PresentationMode>("gated");
  const [gateStatus, setGateStatus] = useState<string>("");
  const [curatorStatus, setCuratorStatus] = useState<string>("");
  const [autoAcceptedSlide, setAutoAcceptedSlide] = useState<SlideData | null>(null);

  type DeepgramLiveConnection = ReturnType<
    ReturnType<typeof createClient>["listen"]["live"]
  >;

  const connectionRef = useRef<DeepgramLiveConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastIdeaTextRef = useRef<string>("");
  const fullTranscriptRef = useRef<string>("");
  const lastGateCheckRef = useRef<string>("");
  const isGatingRef = useRef<boolean>(false);
  const modeRef = useRef<PresentationMode>(mode);
  const priorIdeasRef = useRef<{ title: string; content: string; category: string }[]>([]);
  const slideOptionsRef = useRef<SlideOptions>([null, null]);
  const acceptedSlidesRef = useRef<SlideHistoryEntry[]>([]);

  // Keep refs in sync with state
  modeRef.current = mode;
  slideOptionsRef.current = slideOptions;

  // Call curator to decide where to place a new slide
  const curateSlide = useCallback(
    async (newSlide: SlideData) => {
      const currentOptions = slideOptionsRef.current;

      // If slots are empty, fill them directly
      if (!currentOptions[0]) {
        console.log("📥 Placing slide in empty slot 1");
        setSlideOptions([newSlide, currentOptions[1]]);
        return;
      }
      if (!currentOptions[1]) {
        console.log("📥 Placing slide in empty slot 2");
        setSlideOptions([currentOptions[0], newSlide]);
        return;
      }

      // Both slots full - ask curator
      setCuratorStatus("Evaluating...");
      try {
        const response = await fetch("/api/slide-curator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newSlide: {
              id: newSlide.id,
              headline: newSlide.headline,
              sourceTranscript: newSlide.originalIdea?.content,
              category: newSlide.originalIdea?.category,
            },
            currentOptions: [
              {
                id: currentOptions[0].id,
                headline: currentOptions[0].headline,
                sourceTranscript: currentOptions[0].originalIdea?.content,
                category: currentOptions[0].originalIdea?.category,
              },
              {
                id: currentOptions[1].id,
                headline: currentOptions[1].headline,
                sourceTranscript: currentOptions[1].originalIdea?.content,
                category: currentOptions[1].originalIdea?.category,
              },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("🎭 Curator decision:", data);

          if (data.action === "replace_slot_1") {
            setSlideOptions([newSlide, currentOptions[1]]);
            setCuratorStatus("Replaced option 1");
          } else if (data.action === "replace_slot_2") {
            setSlideOptions([currentOptions[0], newSlide]);
            setCuratorStatus("Replaced option 2");
          } else {
            setCuratorStatus("Discarded (current options better)");
          }
        }
      } catch (err) {
        console.error("❌ Curator failed:", err);
        // Default: replace slot 2 to keep fresh content
        setSlideOptions([currentOptions[0], newSlide]);
        setCuratorStatus("Curator error, replaced slot 2");
      }

      // Clear status after a moment
      setTimeout(() => setCuratorStatus(""), 2000);
    },
    []
  );

  // Generate slide image from structured content (used in gated mode)
  const generateSlideImage = useCallback(
    async (slideContent: SlideContent) => {
      console.log("🎨 Generating slide image:", slideContent);
      setIsProcessing(true);

      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slideContent }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Slide generated:", data);
          if (data.slide) {
            // Use curator to decide placement
            await curateSlide(data.slide);
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
    [curateSlide]
  );

  // Check with the gate if we should create a slide (gated mode)
  const checkSlideGate = useCallback(
    async (transcriptText: string) => {
      if (isGatingRef.current) return;
      if (transcriptText === lastGateCheckRef.current) return;

      isGatingRef.current = true;
      lastGateCheckRef.current = transcriptText;
      setGateStatus("Analyzing...");

      try {
        const response = await fetch("/api/slide-gate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcriptText,
            priorIdeas: priorIdeasRef.current,
            acceptedSlides: acceptedSlidesRef.current,
            isFirstSlide: acceptedSlidesRef.current.length === 0,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("🚦 Gate response:", data);

          if (data.shouldCreateSlide && data.slideContent) {
            setGateStatus("Creating slide...");

            // Track this idea so we don't duplicate it
            priorIdeasRef.current.push({
              title: data.slideContent.headline,
              content: data.slideContent.sourceTranscript,
              category: data.slideContent.category,
            });

            // Clear the accumulated transcript since we're using it
            fullTranscriptRef.current = "";
            setFullTranscript("");
            await generateSlideImage(data.slideContent);
            setGateStatus("");
          } else {
            setGateStatus(data.reason || "Waiting for more content...");
          }
        }
      } catch (err) {
        console.error("❌ Gate check failed:", err);
        setGateStatus("Gate check failed");
      } finally {
        isGatingRef.current = false;
      }
    },
    [generateSlideImage]
  );

  // Direct idea processing (stream-of-consciousness mode)
  // In stream mode, we auto-accept slides directly instead of showing options
  const processIdea = useCallback(
    async (title: string, content: string, category: string) => {
      console.log("🎯 Processing idea (stream mode):", { title, content, category });
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
            // In stream mode, auto-accept the slide directly
            setAutoAcceptedSlide(data.slide);
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

  // Remove a slide from options (when accepted or skipped)
  const removeSlideOption = useCallback((id: string) => {
    setSlideOptions((prev) => {
      if (prev[0]?.id === id) return [prev[1], null];
      if (prev[1]?.id === id) return [prev[0], null];
      return prev;
    });
  }, []);

  // Record an accepted slide for context in future gate calls
  const recordAcceptedSlide = useCallback((slide: SlideData) => {
    acceptedSlidesRef.current.push({
      id: slide.id,
      headline: slide.headline || slide.originalIdea?.title || "Untitled",
      visualDescription: slide.visualDescription || slide.originalIdea?.content || "",
      category: slide.originalIdea?.category || "concept",
    });
    console.log("📚 Recorded accepted slide:", acceptedSlidesRef.current.length, "slides in history");
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

        // When Deepgram marks the segment as final
        if ((data.is_final || data.speech_final) && text.length > 5) {
          if (text === lastIdeaTextRef.current) return;
          lastIdeaTextRef.current = text;

          if (modeRef.current === "gated") {
            // Gated mode: accumulate transcript and check with gate
            fullTranscriptRef.current = fullTranscriptRef.current
              ? `${fullTranscriptRef.current} ${text}`
              : text;
            setFullTranscript(fullTranscriptRef.current);

            // Check with the gate when we have enough content
            // Lower threshold (20 chars) - the gate decides if it's slide-worthy
            // First slide (intro) needs even less content to trigger
            const threshold = acceptedSlidesRef.current.length === 0 ? 20 : 30;
            if (fullTranscriptRef.current.length > threshold) {
              void checkSlideGate(fullTranscriptRef.current);
            }
          } else {
            // Stream-of-consciousness mode: generate slide immediately
            if (text.length > 20) {
              const words = text.split(/\s+/);
              const title = words.slice(0, 6).join(" ");
              void processIdea(title, text, "concept");
            }
          }
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
  }, [processIdea, checkSlideGate]);

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
    setFullTranscript("");
    setGateStatus("");
    setCuratorStatus("");
    setSlideOptions([null, null]);
    fullTranscriptRef.current = "";
    lastGateCheckRef.current = "";
    priorIdeasRef.current = [];
    acceptedSlidesRef.current = [];
  }, []);

  const clearSlideOptions = useCallback(() => {
    setSlideOptions([null, null]);
  }, []);

  const clearAutoAcceptedSlide = useCallback(() => {
    setAutoAcceptedSlide(null);
  }, []);

  return {
    isConnected,
    isRecording,
    isProcessing,
    slideOptions,
    autoAcceptedSlide,
    error,
    transcript,
    fullTranscript,
    gateStatus,
    curatorStatus,
    mode,
    setMode,
    start,
    stop,
    clearSlideOptions,
    clearAutoAcceptedSlide,
    removeSlideOption,
    recordAcceptedSlide,
  };
}

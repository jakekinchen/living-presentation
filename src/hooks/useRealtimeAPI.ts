"use client";

import { useCallback, useRef, useState } from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";
import { convertFilesToImages, type ConvertedSlide } from "@/utils/slideConverter";

export type PresentationMode = "gated" | "stream-of-consciousness";

export type ChannelType = "exploratory" | "audience" | "slides";

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
  isUploaded?: boolean;
  source?: "question" | "exploratory" | "slides";
}

// Channel state with queue and current index
export interface ChannelState {
  queue: SlideData[];
  currentIndex: number;
}

// Compact slide history entry for API context
export interface SlideHistoryEntry {
  id: string;
  headline: string;
  visualDescription: string;
  category: string;
}

// Style reference for maintaining visual consistency
export interface StyleReference {
  headline: string;
  visualDescription: string;
  category: string;
  slideNumber: number;
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

const initialChannelState: ChannelState = { queue: [], currentIndex: 0 };

export function useRealtimeAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [fullTranscript, setFullTranscript] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<PresentationMode>("gated");
  const [gateStatus, setGateStatus] = useState<string>("");
  const [curatorStatus, setCuratorStatus] = useState<string>("");
  const [autoAcceptedSlide, setAutoAcceptedSlide] = useState<SlideData | null>(null);
  const [isUploadingSlides, setIsUploadingSlides] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Channel-based slide queues
  const [exploratoryChannel, setExploratoryChannel] = useState<ChannelState>(initialChannelState);
  const [audienceChannel, setAudienceChannel] = useState<ChannelState>(initialChannelState);
  const [slidesChannel, setSlidesChannel] = useState<ChannelState>(initialChannelState);

  // Legacy compatibility - derive slideOptions and uploadedSlides from channels
  const slideOptions: SlideOptions = [
    exploratoryChannel.queue[exploratoryChannel.currentIndex] || null,
    exploratoryChannel.queue[exploratoryChannel.currentIndex + 1] || null,
  ];
  const uploadedSlides = slidesChannel.queue;

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
  const acceptedSlidesRef = useRef<SlideHistoryEntry[]>([]);
  const styleReferencesRef = useRef<StyleReference[]>([]);
  const slideCounterRef = useRef<number>(0);
  const exploratoryChannelRef = useRef<ChannelState>(initialChannelState);

  // Keep refs in sync with state
  modeRef.current = mode;
  exploratoryChannelRef.current = exploratoryChannel;

  // Add slide to exploratory channel queue
  const addToExploratoryChannel = useCallback((newSlide: SlideData) => {
    const slideWithSource = { ...newSlide, source: "exploratory" as const };
    setExploratoryChannel((prev) => {
      // Limit queue to 10 slides max
      const newQueue = [...prev.queue, slideWithSource].slice(-10);
      return { ...prev, queue: newQueue };
    });
    console.log("Added slide to exploratory channel");
  }, []);

  // Track audience question processing
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);

  // Add slide to audience channel queue (for audience questions)
  // This now answers the question and generates an image slide
  const addToAudienceChannel = useCallback(async (questionText: string, feedbackId: string) => {
    console.log("Processing audience question:", questionText);
    setIsAnsweringQuestion(true);

    try {
      // Step 1: Get an answer to the question
      const answerResponse = await fetch("/api/answer-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          presentationContext: acceptedSlidesRef.current
            .slice(-3)
            .map((s) => `${s.headline}: ${s.visualDescription}`)
            .join("\n"),
        }),
      });

      if (!answerResponse.ok) {
        throw new Error("Failed to get answer");
      }

      const answerData = await answerResponse.json();
      const answer = answerData.answer;

      // Step 2: Generate the slide image using Gemini
      slideCounterRef.current += 1;
      const currentSlideNumber = slideCounterRef.current;

      const geminiResponse = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideContent: {
            headline: answer.headline,
            subheadline: answer.subheadline,
            bullets: answer.bullets,
            visualDescription: answer.visualDescription,
            category: answer.category,
            sourceTranscript: `Q: ${questionText}`,
          },
          styleReferences: styleReferencesRef.current,
          slideNumber: currentSlideNumber,
        }),
      });

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error("Gemini error details:", errorData);
        throw new Error(errorData.details || "Failed to generate slide image");
      }

      const geminiData = await geminiResponse.json();

      // Step 3: Create the slide with the generated image
      const answerSlide: SlideData = {
        id: `audience-${feedbackId}`,
        imageUrl: geminiData.slide?.imageUrl,
        headline: answer.headline,
        subheadline: answer.subheadline,
        bullets: answer.bullets,
        visualDescription: answer.visualDescription,
        source: "question",
        originalIdea: {
          title: `Q: ${questionText}`,
          content: answer.headline,
          category: answer.category,
        },
        timestamp: new Date().toISOString(),
      };

      setAudienceChannel((prev) => ({
        ...prev,
        queue: [...prev.queue, answerSlide],
      }));
      console.log("Added answered question slide to audience channel");
    } catch (error) {
      console.error("Failed to process audience question:", error);
      // Fallback: add the question as-is without an answer
      const fallbackSlide: SlideData = {
        id: `audience-${feedbackId}`,
        headline: questionText,
        source: "question",
        originalIdea: {
          title: "Audience Question",
          content: questionText,
          category: "question",
        },
        timestamp: new Date().toISOString(),
      };
      setAudienceChannel((prev) => ({
        ...prev,
        queue: [...prev.queue, fallbackSlide],
      }));
    } finally {
      setIsAnsweringQuestion(false);
    }
  }, []);

  // Navigate within a channel (for previewing without selecting)
  const navigateChannel = useCallback((channel: ChannelType, direction: "prev" | "next") => {
    const setChannel = channel === "exploratory"
      ? setExploratoryChannel
      : channel === "audience"
        ? setAudienceChannel
        : setSlidesChannel;

    setChannel((prev) => {
      const maxIndex = Math.max(0, prev.queue.length - 1);
      let newIndex = prev.currentIndex;
      if (direction === "prev") {
        newIndex = Math.max(0, prev.currentIndex - 1);
      } else {
        newIndex = Math.min(maxIndex, prev.currentIndex + 1);
      }
      return { ...prev, currentIndex: newIndex };
    });
  }, []);

  // Get current slide for a channel
  const getChannelSlide = useCallback((channel: ChannelType): SlideData | null => {
    const state = channel === "exploratory"
      ? exploratoryChannel
      : channel === "audience"
        ? audienceChannel
        : slidesChannel;
    return state.queue[state.currentIndex] || null;
  }, [exploratoryChannel, audienceChannel, slidesChannel]);

  // Get channel navigation info
  const getChannelInfo = useCallback((channel: ChannelType) => {
    const state = channel === "exploratory"
      ? exploratoryChannel
      : channel === "audience"
        ? audienceChannel
        : slidesChannel;
    return {
      total: state.queue.length,
      currentIndex: state.currentIndex,
      canGoPrev: state.currentIndex > 0,
      canGoNext: state.currentIndex < state.queue.length - 1,
    };
  }, [exploratoryChannel, audienceChannel, slidesChannel]);

  // Use a slide from a channel (adds to history)
  const useSlideFromChannel = useCallback((channel: ChannelType): SlideData | null => {
    const setChannel = channel === "exploratory"
      ? setExploratoryChannel
      : channel === "audience"
        ? setAudienceChannel
        : setSlidesChannel;

    const state = channel === "exploratory"
      ? exploratoryChannel
      : channel === "audience"
        ? audienceChannel
        : slidesChannel;

    const slide = state.queue[state.currentIndex];
    if (!slide) return null;

    // Remove used slide from queue
    setChannel((prev) => {
      const newQueue = prev.queue.filter((_, i) => i !== prev.currentIndex);
      const newIndex = Math.min(prev.currentIndex, Math.max(0, newQueue.length - 1));
      return { queue: newQueue, currentIndex: newIndex };
    });

    return slide;
  }, [exploratoryChannel, audienceChannel, slidesChannel]);

  // Generate slide image from structured content (used in gated mode)
  const generateSlideImage = useCallback(
    async (slideContent: SlideContent) => {
      console.log("Generating slide image:", slideContent);
      setIsProcessing(true);

      // Increment slide counter for this new slide
      slideCounterRef.current += 1;
      const currentSlideNumber = slideCounterRef.current;

      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slideContent,
            styleReferences: styleReferencesRef.current,
            slideNumber: currentSlideNumber,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Slide generated:", data);
          if (data.slide) {
            // Add to exploratory channel queue
            addToExploratoryChannel(data.slide);
          }
        } else {
          console.error("Gemini API error:", await response.text());
        }
      } catch (err) {
        console.error("Failed to generate slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    [addToExploratoryChannel]
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
          console.log("Gate response:", data);

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
        console.error("Gate check failed:", err);
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
      console.log("Processing idea (stream mode):", { title, content, category });
      setIsProcessing(true);

      // Increment slide counter for this new slide
      slideCounterRef.current += 1;
      const currentSlideNumber = slideCounterRef.current;

      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            category,
            styleReferences: styleReferencesRef.current,
            slideNumber: currentSlideNumber,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Gemini response:", data);
          if (data.slide) {
            // In stream mode, auto-accept the slide directly
            setAutoAcceptedSlide(data.slide);
          }
        } else {
          console.error("Gemini API error:", await response.text());
        }
      } catch (err) {
        console.error("Failed to generate slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Remove a slide from exploratory channel (legacy compatibility)
  const removeSlideOption = useCallback((id: string) => {
    setExploratoryChannel((prev) => ({
      ...prev,
      queue: prev.queue.filter((s) => s.id !== id),
      currentIndex: Math.min(prev.currentIndex, Math.max(0, prev.queue.length - 2)),
    }));
  }, []);

  // Record an accepted slide for context in future gate calls
  const recordAcceptedSlide = useCallback((slide: SlideData) => {
    const slideEntry = {
      id: slide.id,
      headline: slide.headline || slide.originalIdea?.title || "Untitled",
      visualDescription: slide.visualDescription || slide.originalIdea?.content || "",
      category: slide.originalIdea?.category || "concept",
    };

    acceptedSlidesRef.current.push(slideEntry);

    // Keep first 2 slides as style references for consistency
    // These establish the visual style that subsequent slides should follow
    if (styleReferencesRef.current.length < 2) {
      styleReferencesRef.current.push({
        headline: slideEntry.headline,
        visualDescription: slideEntry.visualDescription,
        category: slideEntry.category,
        slideNumber: acceptedSlidesRef.current.length,
      });
      console.log("Added style reference slide:", styleReferencesRef.current.length);
    }

    console.log("Recorded accepted slide:", acceptedSlidesRef.current.length, "slides in history");
  }, []);

  // Upload and extract slides from files (images, PDFs, PowerPoint, Keynote)
  const uploadSlides = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploadingSlides(true);
    setUploadProgress("Converting files...");
    console.log("Uploading", files.length, "file(s)");

    try {
      // Convert all files to images (handles PDFs, PPTX, etc.)
      const convertedSlides = await convertFilesToImages(
        files,
        (message, current, total) => {
          setUploadProgress(`${message} (${current}/${total})`);
        }
      );

      if (convertedSlides.length === 0) {
        setUploadProgress("No slides extracted");
        return;
      }

      setUploadProgress(`Extracting content from ${convertedSlides.length} slide(s)...`);

      // Send converted images to extraction API
      const images = convertedSlides.map((slide) => ({
        dataUrl: slide.dataUrl,
        fileName: slide.fileName,
      }));

      const response = await fetch("/api/extract-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Extracted", data.count, "slides");
        if (data.slides && data.slides.length > 0) {
          // Add uploaded slides to the slides channel with source marker
          const slidesWithSource = data.slides.map((s: SlideData) => ({
            ...s,
            source: "slides" as const,
          }));
          setSlidesChannel((prev) => ({
            ...prev,
            queue: [...prev.queue, ...slidesWithSource],
          }));
          setUploadProgress("");
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Failed to extract slides:", errorData);
        setUploadProgress(errorData.suggestion || errorData.error || "Failed to extract slides");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadProgress(message);
    } finally {
      setIsUploadingSlides(false);
      // Clear progress after a delay if successful
      setTimeout(() => setUploadProgress(""), 3000);
    }
  }, []);

  // Use an uploaded slide (move to first position in queue)
  const useUploadedSlide = useCallback((slideId: string): SlideData | null => {
    const slide = slidesChannel.queue.find((s) => s.id === slideId);
    if (slide) {
      // Remove from slides channel queue
      setSlidesChannel((prev) => ({
        ...prev,
        queue: prev.queue.filter((s) => s.id !== slideId),
        currentIndex: Math.min(prev.currentIndex, Math.max(0, prev.queue.length - 2)),
      }));
      return slide;
    }
    return null;
  }, [slidesChannel.queue]);

  // Get next uploaded slide (peek at first in queue)
  const getNextUploadedSlide = useCallback((): SlideData | null => {
    return slidesChannel.queue.length > 0 ? slidesChannel.queue[0] : null;
  }, [slidesChannel.queue]);

  // Remove an uploaded slide without using it
  const removeUploadedSlide = useCallback((slideId: string) => {
    setSlidesChannel((prev) => ({
      ...prev,
      queue: prev.queue.filter((s) => s.id !== slideId),
      currentIndex: Math.min(prev.currentIndex, Math.max(0, prev.queue.length - 2)),
    }));
  }, []);

  // Clear all uploaded slides
  const clearUploadedSlides = useCallback(() => {
    setSlidesChannel({ queue: [], currentIndex: 0 });
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
      console.log("Deepgram connection opened");
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
            console.error("Failed to send audio chunk to Deepgram:", err);
          }
        };

        recorder.start(250);
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied or failed:", err);
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
      console.error("Deepgram connection error:", err);
      setError("Deepgram connection error");
      setIsConnected(false);
      setIsRecording(false);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed");
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
    // Reset all channels
    setExploratoryChannel(initialChannelState);
    setAudienceChannel(initialChannelState);
    setSlidesChannel(initialChannelState);
    fullTranscriptRef.current = "";
    lastGateCheckRef.current = "";
    priorIdeasRef.current = [];
    acceptedSlidesRef.current = [];
    styleReferencesRef.current = [];
    slideCounterRef.current = 0;
  }, []);

  const clearSlideOptions = useCallback(() => {
    setExploratoryChannel(initialChannelState);
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
    uploadedSlides,
    isUploadingSlides,
    uploadProgress,
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
    uploadSlides,
    useUploadedSlide,
    getNextUploadedSlide,
    removeUploadedSlide,
    clearUploadedSlides,
    // Channel-based API
    exploratoryChannel,
    audienceChannel,
    slidesChannel,
    navigateChannel,
    getChannelSlide,
    getChannelInfo,
    useSlideFromChannel,
    addToAudienceChannel,
    isAnsweringQuestion,
  };
}

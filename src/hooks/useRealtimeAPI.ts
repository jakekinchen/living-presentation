"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";
import type { SlideData } from "@/types/slides";
import type { SlideHistoryEntry, StyleReference } from "@/types/realtime";
import { useSlideChannels } from "./useSlideChannels";
import { useSlideUploads } from "./useSlideUploads";
import { useAudienceQuestions } from "./useAudienceQuestions";

export type { SlideData } from "@/types/slides";
export type { ChannelType, SlideOptions } from "./useSlideChannels";

export type PresentationMode = "gated" | "stream-of-consciousness";

interface SlideContent {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
  sourceTranscript: string;
}

type FollowupSlideContent = Omit<SlideContent, "sourceTranscript">;

export function useRealtimeAPI() {
  const {
    exploratoryChannel,
    audienceChannel,
    slidesChannel,
    slideOptions,
    uploadedSlides,
    addToExploratoryChannel,
    navigateChannel,
    getChannelSlide,
    getChannelInfo,
    takeSlideFromChannel,
    removeSlideOption,
    appendAudienceSlide,
    appendSlidesToSlidesChannel,
    useUploadedSlide,
    getNextUploadedSlide,
    removeUploadedSlide,
    clearUploadedSlides,
    resetChannels,
    clearExploratoryChannel,
  } = useSlideChannels();

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
  const { isUploadingSlides, uploadProgress, uploadSlides } = useSlideUploads({
    appendSlidesToSlidesChannel,
    styleReferencesRef,
  });

  modeRef.current = mode;

  const { isAnsweringQuestion, addToAudienceChannel } = useAudienceQuestions({
    appendAudienceSlide,
    acceptedSlidesRef,
    styleReferencesRef,
    slideCounterRef,
  });

  const lastExploratoryGenerationRef = useRef<number>(0);
  const exploratoryGenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingExploratoryContextRef = useRef<{
    acceptedSlides: SlideData[];
    audienceQuestions: SlideData[];
    presenterPrompts: { prompt: string; currentSlide: SlideData | null }[];
  }>({
    acceptedSlides: [],
    audienceQuestions: [],
    presenterPrompts: [],
  });
  const EXPLORATORY_INTERVAL_MS = 20000;

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

  // Consolidate pending exploratory triggers into a single generation run with all fresh context.
  const generateExploratorySlidesFromContext = useCallback(
    async ({
      acceptedSlides,
      audienceQuestions,
      presenterPrompts,
    }: {
      acceptedSlides: SlideData[];
      audienceQuestions: SlideData[];
      presenterPrompts: { prompt: string; currentSlide: SlideData | null }[];
    }) => {
      const latestPrompt = presenterPrompts[presenterPrompts.length - 1];

      const promptSections: string[] = [];
      if (presenterPrompts.length) {
        const promptList = presenterPrompts
          .map((entry) => `- ${entry.prompt}`)
          .join("\n");
        promptSections.push(`Presenter prompts to explore:\n${promptList}`);
      }

      if (acceptedSlides.length) {
        const acceptedSummary = acceptedSlides
          .slice(-3)
          .map((s) => {
            const title = s.headline || s.originalIdea?.title || "Slide";
            const desc = s.visualDescription || s.originalIdea?.content || "";
            return `- ${title}: ${desc}`;
          })
          .join("\n");
        promptSections.push(
          `Follow-ups requested for recently accepted slides:\n${acceptedSummary}`
        );
      }

      if (audienceQuestions.length) {
        const questionSummary = audienceQuestions
          .slice(-3)
          .map((q) => {
            const title =
              q.originalIdea?.content ||
              q.headline ||
              q.visualDescription ||
              "Audience question";
            return `- ${title}`;
          })
          .join("\n");
        promptSections.push(`Audience questions to consider:\n${questionSummary}`);
      }

      const combinedPrompt =
        promptSections.length > 0
          ? `Propose the most valuable next slide ideas. Prioritize the latest presenter intent when present, and incorporate all recent cues.\n\n${promptSections.join(
              "\n\n"
            )}`
          : "Propose the most valuable next slide ideas based on the latest presentation context.";

      const slideHistoryContext = acceptedSlidesRef.current
        .map(
          (s, index) =>
            `${index + 1}. ${s.headline}: ${s.visualDescription}`
        )
        .join("\n");

      const uploadedSlidesContext = slidesChannel.queue
        .slice(0, 5)
        .map((s, index) => {
          const title = s.headline || s.originalIdea?.title || "Slide";
          const desc = s.visualDescription || s.originalIdea?.content || "";
          return `Uploaded ${index + 1}: ${title} — ${desc}`;
        })
        .join("\n");

      const audienceContext = audienceChannel.queue
        .slice(0, 5)
        .map((s, index) => {
          const title = s.headline || s.originalIdea?.title || "Audience";
          const desc = s.visualDescription || s.originalIdea?.content || "";
          return `Audience ${index + 1}: ${title} — ${desc}`;
        })
        .join("\n");

      const slideForContext: SlideData | null =
        latestPrompt?.currentSlide ||
        acceptedSlides[acceptedSlides.length - 1] ||
        acceptedSlidesRef.current[acceptedSlidesRef.current.length - 1] ||
        null;

      setIsProcessing(true);

      try {
        const response = await fetch("/api/exploratory-input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: combinedPrompt,
            currentSlide: slideForContext
              ? {
                  headline: slideForContext.headline,
                  subheadline: slideForContext.subheadline,
                  bullets: slideForContext.bullets,
                  visualDescription:
                    slideForContext.visualDescription ||
                    slideForContext.originalIdea?.content,
                  category:
                    slideForContext.originalIdea?.category || "concept",
                }
              : null,
            transcriptContext: fullTranscriptRef.current || "",
            slideHistoryContext,
            uploadedSlidesContext,
            audienceContext,
          }),
        });

        if (!response.ok) {
          console.error(
            "Failed to generate exploratory slides:",
            await response.text()
          );
          return;
        }

        const data = await response.json();
        const followups = (data.followups || []) as FollowupSlideContent[];
        const cleanedFollowups = followups
          .filter((f) => f && typeof f.headline === "string")
          .slice(0, 1);

        const sourceTranscriptParts: string[] = [];
        if (latestPrompt) {
          sourceTranscriptParts.push(`Presenter prompt: "${latestPrompt.prompt}"`);
        }
        if (acceptedSlides.length) {
          sourceTranscriptParts.push(
            `Follow-ups requested for ${acceptedSlides.length} accepted slide(s)`
          );
        }
        if (audienceQuestions.length) {
          sourceTranscriptParts.push(
            `Audience signals/questions x${audienceQuestions.length}`
          );
        }
        const sourceTranscript =
          sourceTranscriptParts.join(" | ") ||
          "Exploratory generation based on recent context";

        for (const followup of cleanedFollowups) {
          await generateSlideImage({
            headline: followup.headline,
            subheadline: followup.subheadline,
            bullets: followup.bullets,
            visualDescription: followup.visualDescription,
            category: followup.category,
            sourceTranscript,
          });
        }
      } catch (err) {
        console.error("Error generating exploratory slides from context:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    [audienceChannel.queue, generateSlideImage, slidesChannel.queue]
  );

  const triggerExploratoryGeneration = useCallback(
    async (forceNow = false) => {
      const pendingContext = pendingExploratoryContextRef.current;
      const hasPendingContext =
        pendingContext.acceptedSlides.length > 0 ||
        pendingContext.audienceQuestions.length > 0 ||
        pendingContext.presenterPrompts.length > 0;

      if (!hasPendingContext) return;

      const now = Date.now();
      const elapsed = now - lastExploratoryGenerationRef.current;

      if (elapsed < EXPLORATORY_INTERVAL_MS && !forceNow) {
        if (exploratoryGenerationTimeoutRef.current) {
          clearTimeout(exploratoryGenerationTimeoutRef.current);
        }
        const delay = EXPLORATORY_INTERVAL_MS - elapsed;
        exploratoryGenerationTimeoutRef.current = setTimeout(() => {
          void triggerExploratoryGeneration(true);
        }, delay);
        return;
      }

      lastExploratoryGenerationRef.current = now;

      if (exploratoryGenerationTimeoutRef.current) {
        clearTimeout(exploratoryGenerationTimeoutRef.current);
        exploratoryGenerationTimeoutRef.current = null;
      }

      const contextToGenerate = {
        acceptedSlides: [...pendingContext.acceptedSlides],
        audienceQuestions: [...pendingContext.audienceQuestions],
        presenterPrompts: [...pendingContext.presenterPrompts],
      };

      pendingExploratoryContextRef.current = {
        acceptedSlides: [],
        audienceQuestions: [],
        presenterPrompts: [],
      };

      await generateExploratorySlidesFromContext(contextToGenerate);
    },
    [generateExploratorySlidesFromContext]
  );

  // Generate exploratory follow-up slides based on the currently accepted slide
  // This is especially useful when we DON'T have a live microphone, but we
  // do have an uploaded deck and want ideas for "what could come next".
  const generateSlideFollowups = useCallback(
    (slide: SlideData) => {
      const headline =
        slide.headline || slide.originalIdea?.title || "Untitled slide";

      if (!headline.trim()) return;

      pendingExploratoryContextRef.current.acceptedSlides.push(slide);
      void triggerExploratoryGeneration();
    },
    [triggerExploratoryGeneration]
  );

  // Generate follow-up exploratory slides after an audience question slide is accepted
  const generateAudienceFollowups = useCallback(
    (questionSlide: SlideData) => {
      if (questionSlide.source !== "question") return;

      pendingExploratoryContextRef.current.audienceQuestions.push(questionSlide);
      void triggerExploratoryGeneration();
    },
    [triggerExploratoryGeneration]
  );

  // Generate exploratory slides based on an explicit presenter prompt.
  // This blends the typed idea with current slide, slide history, uploaded deck,
  // audience signals, and any available transcript.
  const createExploratoryFromPrompt = useCallback(
    (prompt: string, currentSlide: SlideData | null) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      pendingExploratoryContextRef.current.presenterPrompts.push({
        prompt: trimmed,
        currentSlide,
      });

      void triggerExploratoryGeneration(true);
    },
    [triggerExploratoryGeneration]
  );

  useEffect(() => {
    return () => {
      if (exploratoryGenerationTimeoutRef.current) {
        clearTimeout(exploratoryGenerationTimeoutRef.current);
      }
    };
  }, []);

  // Record an accepted slide for context in future gate calls
  const recordAcceptedSlide = useCallback(
    (slide: SlideData) => {
      const slideEntry = {
        id: slide.id,
        headline: slide.headline || slide.originalIdea?.title || "Untitled",
        visualDescription:
          slide.visualDescription || slide.originalIdea?.content || "",
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
        console.log(
          "Added style reference slide:",
          styleReferencesRef.current.length
        );
      }

      // When an audience question slide is accepted, generate exploratory follow-ups
      if (slide.source === "question") {
        void generateAudienceFollowups(slide);
      }

      // When a slide from the uploaded deck is accepted and the mic isn't active,
      // generate exploratory suggestions for potential next slides.
      void generateSlideFollowups(slide);

      console.log(
        "Recorded accepted slide:",
        acceptedSlidesRef.current.length,
        "slides in history"
      );
    },
    [generateAudienceFollowups, generateSlideFollowups]
  );

  // Record an accepted slide for context in future gate calls

  const start = useCallback(async () => {
    if (connectionRef.current) return;

    setError(null);

    let key: string | undefined;

    try {
      const response = await fetch("/api/deepgram-key");
      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const message =
          errorData?.error || "Failed to obtain temporary Deepgram key";
        setError(message);
        return;
      }

      const data = (await response.json()) as { key?: string };
      if (!data?.key) {
        setError("Failed to obtain temporary Deepgram key");
        return;
      }

      key = data.key;
    } catch (err) {
      console.error("Error fetching temporary Deepgram key:", err);
      setError("Failed to obtain temporary Deepgram key");
      return;
    }

    if (!key) {
      setError("Failed to obtain temporary Deepgram key");
      return;
    }

    const deepgram = createClient(key!);
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

    if (exploratoryGenerationTimeoutRef.current) {
      clearTimeout(exploratoryGenerationTimeoutRef.current);
      exploratoryGenerationTimeoutRef.current = null;
    }
    pendingExploratoryContextRef.current = {
      acceptedSlides: [],
      audienceQuestions: [],
      presenterPrompts: [],
    };
    lastExploratoryGenerationRef.current = 0;

    setIsConnected(false);
    setIsRecording(false);
    setTranscript("");
    setFullTranscript("");
    setGateStatus("");
    setCuratorStatus("");
    // Reset all channels
    resetChannels();
    fullTranscriptRef.current = "";
    lastGateCheckRef.current = "";
    priorIdeasRef.current = [];
    acceptedSlidesRef.current = [];
    styleReferencesRef.current = [];
    slideCounterRef.current = 0;
  }, [resetChannels]);

  const clearSlideOptions = useCallback(() => {
    clearExploratoryChannel();
  }, [clearExploratoryChannel]);

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
    takeSlideFromChannel,
    addToAudienceChannel,
    isAnsweringQuestion,
    createExploratoryFromPrompt,
  };
}

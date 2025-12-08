"use client";

import { useState, useEffect, useRef } from "react";
import { useRealtimeAPI, SlideData, ChannelType } from "@/hooks/useRealtimeAPI";
import { useFeedback } from "@/hooks/useFeedback";
import { getAcceptedFileTypes, isOfficeUploadEnabled } from "@/utils/slideConverter";
import { SlideCanvas } from "./SlideCanvas";
import { ChannelOption } from "./ChannelOption";
import { UploadIcon, SparklesIcon, QuestionIcon, SlidesIcon } from "./Icons";

interface PresenterViewProps {
  onExit: () => void;
}

// Suggestions when there are already slides in history
const EXPLORATORY_SUGGESTIONS: string[] = [
  "Generate a slide that clearly frames the core problem this presentation is solving.",
  "Suggest a deep-dive slide that expands on the key idea from the current slide.",
  "Create a simple 3-step framework slide that organizes this topic for the audience.",
  "Propose a comparison slide that contrasts the current approach with an alternative.",
  "Design a slide that highlights key risks, tradeoffs, or challenges and how to address them.",
  "Create a forward-looking slide about next steps, roadmap, or long-term impact.",
];

// Fun starter topics when there's no slide history yet
const STARTER_TOPICS: string[] = [
  "The future of human-AI collaboration in creative work",
  "How quantum computing will change everyday life",
  "The hidden psychology of viral content",
  "Why cities of the future will grow food on skyscrapers",
  "The science of decision-making under uncertainty",
  "How the attention economy is reshaping culture",
  "The unexpected origins of the internet",
  "What ant colonies teach us about distributed systems",
  "The mathematics behind music and why we love it",
  "How space exploration technology improves life on Earth",
  "The neuroscience of creativity and flow states",
  "Why storytelling is humanity's greatest technology",
];

export function PresenterView({ onExit }: PresenterViewProps) {
  const {
    isConnected,
    isRecording,
    isProcessing,
    autoAcceptedSlide,
    isUploadingSlides,
    uploadProgress,
    error,
    mode,
    setMode,
    start,
    stop,
    clearAutoAcceptedSlide,
    recordAcceptedSlide,
    uploadSlides,
    // Channel-based API
    slidesChannel,
    navigateChannel,
    getChannelSlide,
    getChannelInfo,
    takeSlideFromChannel,
    addToAudienceChannel,
    isAnsweringQuestion,
    createExploratoryFromPrompt,
    transcript,
    fullTranscript,
    pauseGeneration,
    resumeGeneration,
    isGenerationPaused,
  } = useRealtimeAPI();

  const officeUploadsEnabled = isOfficeUploadEnabled();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedFeedbackIdsRef = useRef<Set<string>>(new Set());

  // Session management
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [audienceUrl, setAudienceUrl] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Feedback hook - will connect when sessionId is set
  const { feedback, dismissFeedback } = useFeedback(sessionId);

  // Slide navigation state
  const [slideNav, setSlideNav] = useState<{
    history: SlideData[];
    index: number;
  }>({
    history: [],
    index: -1,
  });
  const [presentationWindow, setPresentationWindow] = useState<Window | null>(null);

  const currentSlide = slideNav.index >= 0 ? slideNav.history[slideNav.index] : null;

  // Exploratory input dialog state
  const [showExploratoryInput, setShowExploratoryInput] = useState(false);
  const [exploratoryInput, setExploratoryInput] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(() =>
    EXPLORATORY_SUGGESTIONS.length > 0
      ? Math.floor(Math.random() * EXPLORATORY_SUGGESTIONS.length)
      : 0
  );
  const [starterIndex, setStarterIndex] = useState(() =>
    STARTER_TOPICS.length > 0
      ? Math.floor(Math.random() * STARTER_TOPICS.length)
      : 0
  );

  // Check if we have any slide history
  const hasSlideHistory = slideNav.history.length > 0;
  const displayedTranscript = (fullTranscript || transcript || "").trim();

  // Create session on component mount
  useEffect(() => {
    async function createSession() {
      setCreatingSession(true);
      try {
        const response = await fetch("/api/sessions/create", {
          method: "POST",
        });
        if (response.ok) {
          const data = await response.json();
          setSessionId(data.sessionId);
          setAudienceUrl(`${window.location.origin}${data.audienceUrl}`);
          console.log("Session created:", data.sessionId);
        } else {
          console.error("Failed to create session");
        }
      } catch (err) {
        console.error("Error creating session:", err);
      } finally {
        setCreatingSession(false);
      }
    }
    createSession();
  }, []);

  // When new feedback arrives, add it to the audience channel
  useEffect(() => {
    if (feedback.length > 0) {
      const latestFeedback = feedback[0];
      // Check if we've already processed this feedback ID
      if (processedFeedbackIdsRef.current.has(latestFeedback.id)) {
        return;
      }
      // Mark as processed immediately to prevent duplicate processing
      processedFeedbackIdsRef.current.add(latestFeedback.id);

      (async () => {
        const result = await addToAudienceChannel(
          latestFeedback.text,
          latestFeedback.id
        );
        if (result.accepted) {
          dismissFeedback(latestFeedback.id);
        } else {
          // Question was rejected by the gate; keep it visible but mark as read
          console.log(
            "Audience question rejected by gate:",
            result.reason || "No reason provided"
          );
        }
      })();
    }
  }, [feedback, addToAudienceChannel, dismissFeedback]);

  // Open presentation window
  const openPresentationWindow = () => {
    if (!sessionId) return;
    const win = window.open(
      `/presentation/${sessionId}`,
      "presentation",
      "width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no"
    );
    setPresentationWindow(win);
  };

  // Copy audience URL to clipboard
  const copyAudienceUrl = () => {
    if (audienceUrl) {
      navigator.clipboard.writeText(audienceUrl);
    }
  };

  // Sync current slide to presentation window and broadcast to all audience members
  useEffect(() => {
    // Send to local presentation window via postMessage
    if (presentationWindow && !presentationWindow.closed) {
      presentationWindow.postMessage(
        { type: "UPDATE_SLIDE", slide: currentSlide, showQRCode, audienceUrl },
        window.location.origin
      );
    }

    // Broadcast to all audience members via API
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/slide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: currentSlide, showQRCode, audienceUrl }),
      }).catch((err) => console.error("Failed to broadcast slide:", err));
    }
  }, [currentSlide, presentationWindow, sessionId, showQRCode, audienceUrl]);

  // Auto-accept slides in stream mode
  useEffect(() => {
    if (autoAcceptedSlide) {
      setSlideNav((prev) => {
        const baseHistory =
          prev.index >= 0 ? prev.history.slice(0, prev.index + 1) : [];
        const history = [...baseHistory, autoAcceptedSlide];
        return { history, index: history.length - 1 };
      });
      recordAcceptedSlide(autoAcceptedSlide);
      clearAutoAcceptedSlide();
    }
  }, [autoAcceptedSlide, clearAutoAcceptedSlide, recordAcceptedSlide]);

  // Keyboard navigation for slides
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSlideNav((prev) => {
          if (prev.index <= 0) return prev;
          return { ...prev, index: prev.index - 1 };
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSlideNav((prev) => {
          if (prev.index >= prev.history.length - 1) return prev;
          return { ...prev, index: prev.index + 1 };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle using a slide from a channel
  const handleUseChannelSlide = (channel: ChannelType) => {
    const slide = takeSlideFromChannel(channel);
    if (slide) {
      setSlideNav((prev) => {
        const baseHistory =
          prev.index >= 0 ? prev.history.slice(0, prev.index + 1) : [];
        const history = [...baseHistory, slide];
        return { history, index: history.length - 1 };
      });
      recordAcceptedSlide(slide);
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadSlides(Array.from(files));
    }
    // Reset input so same file can be selected again
    event.target.value = "";
  };

  const handleExit = () => {
    stop();
    if (presentationWindow && !presentationWindow.closed) {
      presentationWindow.close();
    }
    onExit();
  };

  const cycleExploratorySuggestion = () => {
    if (hasSlideHistory) {
      // Use context-aware suggestions when we have slides
      if (EXPLORATORY_SUGGESTIONS.length === 0) return;
      setSuggestionIndex((prev) => {
        const next = (prev + 1) % EXPLORATORY_SUGGESTIONS.length;
        setExploratoryInput(EXPLORATORY_SUGGESTIONS[next]);
        return next;
      });
    } else {
      // Use fun starter topics when no history
      if (STARTER_TOPICS.length === 0) return;
      setStarterIndex((prev) => {
        const next = (prev + 1) % STARTER_TOPICS.length;
        setExploratoryInput(STARTER_TOPICS[next]);
        return next;
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6">
        {/* Top row: Title, status, and primary actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <h1 className="text-base font-semibold text-white sm:text-lg">Presenter Controls</h1>
            <div className="flex flex-wrap items-center gap-2">
              {isRecording ? (
                <span className="flex items-center gap-2 rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-400 sm:px-3 sm:text-sm">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </span>
              ) : isConnected ? (
                <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400 sm:px-3 sm:text-sm">
                  Connected
                </span>
              ) : (
                <span className="rounded-full bg-zinc-700 px-2 py-1 text-xs text-zinc-400 sm:px-3 sm:text-sm">
                  {creatingSession ? "Creating..." : "Ready"}
                </span>
              )}
              {isProcessing && (
                <span className="rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-400 sm:px-3 sm:text-sm">
                  Generating...
                </span>
              )}
              {isGenerationPaused && (
                <span className="rounded-full bg-zinc-700 px-2 py-1 text-xs text-zinc-300 sm:px-3 sm:text-sm">
                  Paused
                </span>
              )}
            </div>
          </div>

          {/* Primary actions - always visible */}
          <div className="flex items-center gap-2">
            {!isRecording && !isConnected && (
              <button
                onClick={start}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200 sm:px-4 sm:py-2 sm:text-sm"
              >
                Start Mic
              </button>
            )}
            {isRecording && (
              <button
                onClick={stop}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 sm:px-4 sm:py-2 sm:text-sm"
              >
                Stop
              </button>
            )}
            {(isConnected || isRecording || isGenerationPaused) && (
              <button
                onClick={isGenerationPaused ? resumeGeneration : pauseGeneration}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                  isGenerationPaused
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {isGenerationPaused ? "Resume Slides" : "Pause Slides"}
              </button>
            )}
            <button
              onClick={handleExit}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white sm:px-4 sm:py-2 sm:text-sm"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Secondary controls row - wraps on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 p-1">
            <button
              onClick={() => setMode("gated")}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 ${
                mode === "gated"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Gated
            </button>
            <button
              onClick={() => setMode("stream-of-consciousness")}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 ${
                mode === "stream-of-consciousness"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Stream
            </button>
          </div>

          <button
            onClick={openPresentationWindow}
            disabled={!sessionId}
            className="hidden rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:block sm:px-4 sm:py-2 sm:text-sm"
          >
            Open Presentation
          </button>

          {/* Audience display controls */}
          {audienceUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowQRCode(!showQRCode)}
                className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                  showQRCode
                    ? "bg-white text-zinc-900"
                    : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <span className="sm:hidden">{showQRCode ? "Hide QR" : "Show QR"}</span>
                <span className="hidden sm:inline">{showQRCode ? "Hide QR Code" : "Show QR Code"}</span>
              </button>
              <button
                onClick={() => setShowUrl(!showUrl)}
                className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:px-4 sm:py-2 sm:text-sm"
              >
                {showUrl ? "Hide URL" : "Show URL"}
              </button>
              <button
                onClick={() => setShowTranscript((prev) => !prev)}
                className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:px-4 sm:py-2 sm:text-sm"
              >
                {showTranscript ? "Hide Transcript" : "Show Transcript"}
              </button>
            </div>
          )}
        </div>

        {/* Audience Controls */}
        {audienceUrl && showUrl && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2">
              <code className="flex-1 text-sm text-zinc-300">{audienceUrl}</code>
              <button
                onClick={copyAudienceUrl}
                className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </header>

      {showTranscript && (
        <div className="mx-6 mt-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Transcript
          </div>
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-200">
            {displayedTranscript || "No transcript captured yet."}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:flex-row">
        {/* Current slide preview */}
        <div className="flex flex-1 flex-col">
          <div className="mb-2 text-xs font-medium text-zinc-500 sm:mb-3 sm:text-sm">CURRENT SLIDE</div>
          <div className="aspect-video flex-1 overflow-hidden rounded-xl border border-zinc-800 lg:aspect-auto">
            <SlideCanvas slide={currentSlide} />
          </div>
          {/* Hidden file input for upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept={getAcceptedFileTypes()}
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          {uploadProgress && (
            <p className="mt-2 text-xs text-blue-400">{uploadProgress}</p>
          )}
        </div>

        {/* Right side: channel options */}
        <div className="flex w-full flex-col gap-3 sm:gap-4 lg:w-[420px]">
          {/* Channel options header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 sm:text-sm">SLIDE CHANNELS</span>
            {mode === "stream-of-consciousness" && (
              <span className="text-xs text-purple-400">Auto-display mode</span>
            )}
          </div>

          {/* Three channel options - stacked vertically */}
          <div className="flex flex-col gap-3">
            {/* Exploratory Channel */}
            <ChannelOption
              channel="exploratory"
              label="Exploratory"
              icon={<SparklesIcon className="h-4 w-4 text-purple-400" />}
              accentColor="border-purple-700/50"
              currentSlide={getChannelSlide("exploratory")}
              channelInfo={getChannelInfo("exploratory")}
              onNavigate={(dir) => navigateChannel("exploratory", dir)}
              onUse={() => handleUseChannelSlide("exploratory")}
              isProcessing={isProcessing}
              isRecording={isRecording}
              emptyMessage={
                isRecording
                  ? "Listening for ideas..."
                  : hasSlideHistory
                    ? "Type an idea to explore"
                    : "Pick a topic to start exploring"
              }
              onEmptyAction={() => {
                setShowExploratoryInput(true);
                if (!exploratoryInput) {
                  if (hasSlideHistory && EXPLORATORY_SUGGESTIONS.length > 0) {
                    setExploratoryInput(EXPLORATORY_SUGGESTIONS[suggestionIndex]);
                  } else if (!hasSlideHistory && STARTER_TOPICS.length > 0) {
                    setExploratoryInput(STARTER_TOPICS[starterIndex]);
                  }
                }
              }}
              emptyActionLabel={hasSlideHistory ? "New exploratory idea" : "Pick a topic to explore"}
            />

            {/* Audience Questions Channel */}
            <ChannelOption
              channel="audience"
              label="Audience"
              icon={<QuestionIcon className="h-4 w-4 text-blue-400" />}
              accentColor="border-blue-700/50"
              currentSlide={getChannelSlide("audience")}
              channelInfo={getChannelInfo("audience")}
              onNavigate={(dir) => navigateChannel("audience", dir)}
              onUse={() => handleUseChannelSlide("audience")}
              isProcessing={isAnsweringQuestion}
              emptyMessage={isAnsweringQuestion ? "Answering question..." : "No questions yet"}
            />

            {/* Uploaded Slides Channel */}
            {slidesChannel.queue.length > 0 ? (
              <ChannelOption
                channel="slides"
                label="My Slides"
                icon={<SlidesIcon className="h-4 w-4 text-amber-400" />}
                accentColor="border-amber-700/50"
                currentSlide={getChannelSlide("slides")}
                channelInfo={getChannelInfo("slides")}
                onNavigate={(dir) => navigateChannel("slides", dir)}
                onUse={() => handleUseChannelSlide("slides")}
                emptyMessage="Upload slides"
              />
            ) : (
              <div className="flex flex-col rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <SlidesIcon className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    My Slides
                  </span>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingSlides}
                  className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 py-4 text-center transition-colors hover:border-amber-600/50 hover:bg-zinc-800/50"
                >
                  <UploadIcon className="mb-1 h-6 w-6 text-zinc-500" />
                  <span className="text-xs text-zinc-500">
                    {isUploadingSlides
                      ? "Processing..."
                      : officeUploadsEnabled
                        ? "Upload PDF, PowerPoint, or Keynote"
                        : "Upload PDF or images"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exploratory input dialog */}
      {showExploratoryInput && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold text-white">
              {hasSlideHistory ? "New exploratory idea" : "Start exploring a topic"}
            </h2>
            <p className="mb-3 text-xs text-zinc-400">
              {hasSlideHistory
                ? "Describe the next concept, question, or direction you want a slide for. We'll consider your current slide, uploaded deck, live transcript, and audience context."
                : "Pick a fascinating topic to dive into, or type your own. We'll generate beautiful slides to kick off your exploration."}
            </p>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {hasSlideHistory ? "Prompt" : "Topic"}
              </span>
              {((hasSlideHistory && EXPLORATORY_SUGGESTIONS.length > 0) ||
                (!hasSlideHistory && STARTER_TOPICS.length > 0)) && (
                <button
                  type="button"
                  onClick={cycleExploratorySuggestion}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  {hasSlideHistory ? "Suggestions" : "More topics"}
                </button>
              )}
            </div>
            <textarea
              value={exploratoryInput}
              onChange={(event) => setExploratoryInput(event.target.value)}
              className="mb-3 h-28 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              placeholder={
                hasSlideHistory
                  ? "E.g. A slide that introduces the long-term roadmap and why it matters"
                  : "E.g. The science behind black holes, or How do vaccines work?"
              }
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExploratoryInput(false);
                  setExploratoryInput("");
                }}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!exploratoryInput.trim() || isProcessing}
                onClick={async () => {
                  const value = exploratoryInput.trim();
                  if (!value) return;
                  await createExploratoryFromPrompt(value, currentSlide);
                  setExploratoryInput("");
                  setShowExploratoryInput(false);
                }}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

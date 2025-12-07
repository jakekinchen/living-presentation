"use client";

import { useState, useEffect, useRef } from "react";
import { useRealtimeAPI, SlideData, ChannelType } from "@/hooks/useRealtimeAPI";
import { useFeedback } from "@/hooks/useFeedback";
import { SlideCanvas } from "./SlideCanvas";
import { ChannelOption } from "./ChannelOption";
import { UploadIcon, SparklesIcon, QuestionIcon, SlidesIcon } from "./Icons";

interface PresenterViewProps {
  onExit: () => void;
}

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
    exploratoryChannel,
    slidesChannel,
    navigateChannel,
    getChannelSlide,
    getChannelInfo,
    useSlideFromChannel,
    addToAudienceChannel,
    isAnsweringQuestion,
  } = useRealtimeAPI();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session management
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [audienceUrl, setAudienceUrl] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

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
      // Check if it's already in the audience queue to avoid duplicates
      const audienceChannelState = getChannelInfo("audience");
      const alreadyInQueue = audienceChannelState.total > 0 &&
        getChannelSlide("audience")?.id === `audience-${latestFeedback.id}`;
      if (!alreadyInQueue) {
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
    }
  }, [feedback, getChannelInfo, getChannelSlide, addToAudienceChannel, dismissFeedback]);

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
        { type: "UPDATE_SLIDE", slide: currentSlide },
        window.location.origin
      );
    }

    // Broadcast to all audience members via API
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/slide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: currentSlide }),
      }).catch((err) => console.error("Failed to broadcast slide:", err));
    }
  }, [currentSlide, presentationWindow, sessionId]);

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
  const useChannelSlide = (channel: ChannelType) => {
    const slide = useSlideFromChannel(channel);
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">Presenter Controls</h1>
            <div className="flex items-center gap-2">
              {isRecording ? (
                <span className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </span>
              ) : isConnected ? (
                <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                  Connected
                </span>
              ) : (
                <span className="rounded-full bg-zinc-700 px-3 py-1 text-sm text-zinc-400">
                  {creatingSession ? "Creating session..." : "Ready"}
                </span>
              )}
              {isProcessing && (
                <span className="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-400">
                  Generating...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 p-1">
              <button
                onClick={() => setMode("gated")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "gated"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Gated
              </button>
              <button
                onClick={() => setMode("stream-of-consciousness")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Open Presentation Window
            </button>
            {!isRecording && !isConnected && (
              <button
                onClick={start}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Start Recording
              </button>
            )}
            {isRecording && (
              <button
                onClick={stop}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Stop
              </button>
            )}
            <button
              onClick={handleExit}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Audience URL Section */}
        {audienceUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2">
            <span className="text-sm text-zinc-500">Share with audience:</span>
            <code className="flex-1 text-sm text-zinc-300">{audienceUrl}</code>
            <button
              onClick={copyAudienceUrl}
              className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              Copy
            </button>
          </div>
        )}
      </header>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-6 p-6">
        {/* Current slide preview */}
        <div className="flex flex-1 flex-col">
          <div className="mb-3 text-sm font-medium text-zinc-500">CURRENT SLIDE</div>
          <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800">
            <SlideCanvas slide={currentSlide} />
          </div>
          {/* Hidden file input for upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.pptx,.ppt,.key,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          {uploadProgress && (
            <p className="mt-2 text-xs text-blue-400">{uploadProgress}</p>
          )}
        </div>

        {/* Right side: channel options */}
        <div className="flex w-[420px] flex-col gap-4">
          {/* Channel options header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500">SLIDE CHANNELS</span>
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
              onUse={() => useChannelSlide("exploratory")}
              isProcessing={isProcessing}
              isRecording={isRecording}
              emptyMessage={isRecording ? "Listening..." : "AI suggestions"}
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
              onUse={() => useChannelSlide("audience")}
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
                onUse={() => useChannelSlide("slides")}
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
                    {isUploadingSlides ? "Processing..." : "Upload"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRealtimeAPI, SlideData } from "@/hooks/useRealtimeAPI";
import { useFeedback } from "@/hooks/useFeedback";
import { Logo } from "@/components/Logo";

// Background color mapping - new sophisticated slide colors
const bgColors: Record<string, string> = {
  ocean: "",  // Will use inline style
  forest: "",
  sunset: "",
  plum: "",
  rose: "",
  teal: "",
  white: "bg-white",
  black: "bg-black",
};

// Slide color definitions
const slideColors: Record<string, string> = {
  ocean: "#1e40af",
  forest: "#047857",
  sunset: "#ea580c",
  plum: "#7c3aed",
  rose: "#e11d48",
  teal: "#0d9488",
};

// Light colors that need dark text
const lightColors = ["white", "#ffffff", "#fff", "#f0f8ff", "#fafafa", "#f5f5f5", "#e5e5e5", "amber"];

function isLightColor(color: string): boolean {
  const lower = color.toLowerCase();
  if (lightColors.includes(lower)) return true;
  if (lower.startsWith("#") && lower.length >= 4) {
    const firstChar = lower[1];
    return ["f", "e", "d", "c"].includes(firstChar);
  }
  return false;
}

function getBgClass(color: string): string {
  const lower = color.toLowerCase();
  if (bgColors[lower]) return bgColors[lower];
  if (color.startsWith("#")) return "";
  return "bg-zinc-800";
}

function getBgStyle(color: string): React.CSSProperties {
  // Check if it's one of our named slide colors
  if (slideColors[color]) {
    return { backgroundColor: slideColors[color] };
  }
  // Otherwise, if it's a hex color, use it directly
  if (color.startsWith("#")) {
    return { backgroundColor: color };
  }
  return {};
}

// Slide Canvas - the pure presentation view
function SlideCanvas({ slide, isFullscreen = false }: { slide: SlideData | null; isFullscreen?: boolean }) {
  if (!slide) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-canvas-900 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="text-center text-canvas-600">
          <div className="mb-4 text-6xl">...</div>
          <p className="text-xl">Waiting for first slide</p>
        </div>
      </div>
    );
  }

  if (slide.imageUrl) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-black ${isFullscreen ? "min-h-screen" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.imageUrl}
          alt="Presentation Slide"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  // Special template for audience question slides
  if (slide.source === "question") {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-coral-500 via-coral-600 to-coral-700 p-12 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="w-full max-w-5xl">
          {/* Question Icon and Label */}
          <div className="mb-12 flex items-center justify-center gap-4">
            <svg className="h-14 w-14 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-3xl font-bold uppercase tracking-wide text-white/90">
              Question from Audience
            </span>
          </div>

          {/* Question Card with glow effect */}
          <div className="relative">
            {/* Decorative glow */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-coral-300 via-warmslate-50 to-coral-300 opacity-75 blur-sm" />

            {/* Actual card */}
            <div className="relative rounded-2xl bg-warmslate-50 p-16 shadow-2xl">
              <p className="text-center text-5xl font-bold leading-relaxed text-canvas-900">
                {slide.headline}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const bgClass = getBgClass(slide.backgroundColor || "zinc");
  const bgStyle = getBgStyle(slide.backgroundColor || "zinc");
  const isLight = isLightColor(slide.backgroundColor || "zinc");

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center p-12 ${bgClass} ${isFullscreen ? "min-h-screen" : ""}`}
      style={bgStyle}
    >
      <div className="max-w-4xl text-center">
        <h1 className={`mb-6 text-6xl font-bold leading-tight ${isLight ? "text-canvas-900" : "text-white"}`}>
          {slide.headline}
        </h1>
        {slide.subheadline && (
          <p className={`mb-10 text-3xl font-medium opacity-90 ${isLight ? "text-canvas-600" : "text-white"}`}>
            {slide.subheadline}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="space-y-5 text-left">
            {slide.bullets.map((bullet, i) => (
              <li key={i} className={`flex items-start gap-5 text-xl ${isLight ? "text-canvas-700" : "text-white"}`}>
                <span className={`mt-2.5 h-3 w-3 flex-shrink-0 rounded-full ${isLight ? "bg-canvas-400" : "opacity-70"}`} style={isLight ? {} : { backgroundColor: slideColors[slide.backgroundColor || ''] || '#fff' }} />
                {bullet}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Next slide preview
function NextSlidePreview({
  slide,
  onAccept,
  onSkip,
}: {
  slide: SlideData;
  onAccept: () => void;
  onSkip: () => void;
}) {
  if (slide.imageUrl) {
    return (
      <div className="flex flex-col gap-3">
        <div className="aspect-video overflow-hidden rounded-xl border border-canvas-700 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt="Slide Preview"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-coral-600"
          >
            Use This Slide
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-canvas-700 px-4 py-2 text-sm font-medium text-canvas-400 transition-colors hover:bg-canvas-800/30 hover:text-white"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Special template preview for audience question slides
  if (slide.source === "question") {
    return (
      <div className="flex flex-col gap-3">
        <div className="aspect-video overflow-hidden rounded-xl border border-canvas-700 bg-gradient-to-br from-coral-500 via-coral-600 to-coral-700">
          <div className="flex h-full flex-col items-center justify-center p-4">
            {/* Question Icon and Label */}
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-6 w-6 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
                Audience Question
              </span>
            </div>
            {/* Question Text */}
            <div className="rounded-lg border-2 border-coral-300 bg-warmslate-50 px-4 py-3">
              <p className="line-clamp-3 text-center text-sm font-bold leading-tight text-canvas-900">
                {slide.headline}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-coral-600"
          >
            Use This Slide
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-canvas-700 px-4 py-2 text-sm font-medium text-canvas-400 transition-colors hover:bg-canvas-800/30 hover:text-white"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  const bgClass = getBgClass(slide.backgroundColor || "zinc");
  const bgStyle = getBgStyle(slide.backgroundColor || "zinc");
  const isLight = isLightColor(slide.backgroundColor || "zinc");

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`aspect-video overflow-hidden rounded-xl border border-canvas-700 ${bgClass}`}
        style={bgStyle}
      >
        <div className="flex h-full flex-col items-center justify-center p-6 text-center">
          <h3 className={`text-lg font-bold leading-tight ${isLight ? "text-canvas-900" : "text-white"}`}>
            {slide.headline}
          </h3>
          {slide.subheadline && (
            <p className={`mt-2 text-sm ${isLight ? "text-canvas-600" : "text-canvas-400"}`}>
              {slide.subheadline}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="flex-1 rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-coral-600"
        >
          Use This Slide
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg border border-canvas-700 px-4 py-2 text-sm font-medium text-canvas-400 transition-colors hover:bg-canvas-800/30 hover:text-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// Splash screen with PDF upload
function SplashScreen({ onStart }: { onStart: (pdfSlides?: SlideData[]) => void }) {
  const [uploadedPdfSlides, setUploadedPdfSlides] = useState<SlideData[] | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    setIsProcessingPdf(true);
    try {
      const { convertPdfToSlides } = await import('@/utils/pdfToImages');
      const slides = await convertPdfToSlides(file);
      setUploadedPdfSlides(slides);
      console.log(`✅ Converted ${slides.length} PDF pages to slides`);
    } catch (error) {
      console.error('❌ Failed to process PDF:', error);
      alert('Failed to process PDF. Please try again.');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-canvas-900 via-canvas-800 to-canvas-900">
      <div className="text-center">
        <div className="mb-6 flex items-center justify-center">
          <Logo size="xl" variant="gradient" animated />
        </div>
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white">
          SlideQuest
        </h1>
        <p className="max-w-md text-lg text-canvas-400">
          Upload your slides, then speak new ideas into existence.
        </p>
      </div>

      {/* PDF Upload Section */}
      <div className="flex flex-col items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          className="hidden"
        />

        {!uploadedPdfSlides ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingPdf}
            className="rounded-xl border-2 border-dashed border-canvas-600 bg-canvas-800/50 px-8 py-6 text-center transition-all duration-300 hover:border-coral-400/50 hover:bg-canvas-800/60 disabled:opacity-50"
          >
            <div className="flex flex-col items-center gap-2">
              <svg className="h-12 w-12 text-canvas-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-lg font-medium text-white">
                {isProcessingPdf ? 'Processing PDF...' : 'Upload Existing Slides (PDF)'}
              </span>
              <span className="text-sm text-canvas-500">Optional - or start with a blank presentation</span>
            </div>
          </button>
        ) : (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-8 py-4 text-center">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-lg font-medium text-green-400">
                {uploadedPdfSlides.length} slides loaded
              </span>
            </div>
            <button
              onClick={() => {
                setUploadedPdfSlides(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="mt-2 text-sm text-canvas-400 underline hover:text-canvas-300"
            >
              Upload different PDF
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => onStart(uploadedPdfSlides || undefined)}
        className="rounded-full bg-coral-500 px-12 py-4 text-lg font-semibold text-white shadow-coral-lg transition-all duration-200 hover:scale-105 hover:bg-coral-600 hover:shadow-coral-lg active:scale-[0.98]"
      >
        Start Presenting
      </button>

      <div className="mt-8 flex items-center gap-2 text-sm text-canvas-500">
        <MicIcon className="h-4 w-4" />
        <span>Microphone access required for new slides</span>
      </div>
    </div>
  );
}

// Main presenter view with controls
function PresenterView({ onExit, initialSlides }: { onExit: () => void; initialSlides?: SlideData[] }) {
  const {
    isConnected,
    isRecording,
    isProcessing,
    pendingSlides,
    error,
    transcript,
    start,
    stop,
    removeSlide,
    addSlides,
    processFeedback,
  } = useRealtimeAPI();

  const [slideNav, setSlideNav] = useState<{
    history: SlideData[];
    index: number;
  }>({
    history: [],
    index: -1,
  });
  const [presentationWindow, setPresentationWindow] = useState<Window | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [audienceUrl, setAudienceUrl] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const { feedback, unreadCount, dismissFeedback } = useFeedback(sessionId);

  const currentSlide = slideNav.index >= 0 ? slideNav.history[slideNav.index] : null;

  // Add initial PDF slides to the queue when component mounts
  useEffect(() => {
    if (initialSlides && initialSlides.length > 0) {
      addSlides(initialSlides);
      console.log(`✅ Added ${initialSlides.length} PDF slides to queue`);
    }
  }, [initialSlides, addSlides]);

  // Separate pending slides by source
  const voiceSlides = pendingSlides.filter((s) => s.source === "voice");
  const questionSlides = pendingSlides.filter((s) => s.source === "question");

  // Get the next pending slides
  const nextVoiceSlide = voiceSlides[0] || null;
  const nextQuestionSlide = questionSlides[0] || null;

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
          console.log("✅ Session created:", data.sessionId);
        } else {
          console.error("❌ Failed to create session");
        }
      } catch (err) {
        console.error("❌ Error creating session:", err);
      } finally {
        setCreatingSession(false);
      }
    }
    createSession();
  }, []);

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

  // Handle generating slide from feedback
  const handleGenerateSlide = async (feedbackId: string, questionText: string) => {
    await processFeedback(feedbackId, questionText);
    dismissFeedback(feedbackId);
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

  // Keyboard navigation for previous slide
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSlideNav((prev) => {
          if (prev.index <= 0) return prev;
          return { ...prev, index: prev.index - 1 };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle accepting a slide
  const acceptSlide = (slide: SlideData) => {
    setSlideNav((prev) => {
      const baseHistory =
        prev.index >= 0 ? prev.history.slice(0, prev.index + 1) : [];
      const history = [...baseHistory, slide];
      return { history, index: history.length - 1 };
    });
    removeSlide(slide.id);
  };

  // Skip current pending slide
  const skipSlide = (slideId: string) => {
    removeSlide(slideId);
  };

  const handleExit = () => {
    stop();
    if (presentationWindow && !presentationWindow.closed) {
      presentationWindow.close();
    }
    onExit();
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas-950">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-canvas-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size="sm" variant="default" />
            <h1 className="text-lg font-semibold text-white">Presenter Controls</h1>
            <div className="flex items-center gap-2">
              {isRecording ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-sm font-semibold text-red-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </span>
              ) : isConnected ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400">
                  Connected
                </span>
              ) : (
                <span className="rounded-full border border-canvas-600 bg-canvas-700 px-3 py-1.5 text-sm font-medium text-canvas-400">
                  Ready
                </span>
              )}
              {isProcessing && (
                <span className="animate-pulse-slow rounded-full border border-coral-500/30 bg-coral-500/15 px-3 py-1.5 text-sm font-medium text-coral-400">
                  Generating...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openPresentationWindow}
              disabled={!sessionId}
              className="rounded-lg border border-canvas-700 bg-canvas-800 px-4 py-2 text-sm font-medium text-canvas-100 transition-all duration-200 hover:border-canvas-600 hover:bg-canvas-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open Presentation Window
            </button>
            {!isRecording && !isConnected && (
              <button
                onClick={start}
                className="flex items-center gap-2 rounded-xl bg-coral-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-coral-500/20 transition-all duration-200 hover:scale-[1.02] hover:bg-coral-600 hover:shadow-xl hover:shadow-coral-500/30 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                Record New Slide
              </button>
            )}
            {isRecording && (
              <button
                onClick={stop}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500 px-4 py-2 text-sm font-medium text-white ring-4 ring-red-500/20 transition-colors hover:bg-red-600"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                Stop Recording
              </button>
            )}
            <button
              onClick={handleExit}
              className="rounded-lg border border-canvas-700 px-4 py-2 text-sm font-medium text-canvas-400 transition-all duration-200 hover:border-canvas-600 hover:bg-canvas-800/30 hover:text-canvas-200"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Audience URL Section */}
        {audienceUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-canvas-700 bg-canvas-900/50 px-4 py-2">
            <span className="text-sm text-canvas-500">Share with audience:</span>
            <code className="flex-1 text-sm text-canvas-300">{audienceUrl}</code>
            <button
              onClick={copyAudienceUrl}
              className="rounded bg-canvas-700 px-3 py-1 text-xs font-medium text-canvas-300 transition-colors hover:bg-canvas-600"
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
          <div className="mb-3 text-sm font-medium uppercase tracking-wider text-canvas-500">CURRENT SLIDE</div>
          <div className="flex-1 overflow-hidden rounded-xl border border-canvas-800">
            <SlideCanvas slide={currentSlide} />
          </div>
        </div>

        {/* Right side: next slides + transcript */}
        <div className="flex w-80 flex-col gap-6">
          {/* Next Voice Slide */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium uppercase tracking-wider text-canvas-500">
                NEXT VOICE SLIDE {voiceSlides.length > 1 && `(${voiceSlides.length} queued)`}
              </span>
            </div>

            {nextVoiceSlide ? (
              <NextSlidePreview
                slide={nextVoiceSlide}
                onAccept={() => acceptSlide(nextVoiceSlide)}
                onSkip={() => skipSlide(nextVoiceSlide.id)}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-canvas-800 text-canvas-600">
                {isRecording ? (
                  <div className="text-center">
                    <div className="mb-2 animate-pulse text-2xl">...</div>
                    <p className="text-sm">Listening for ideas</p>
                  </div>
                ) : (
                  <p className="text-sm">Start recording to capture slides</p>
                )}
              </div>
            )}
          </div>

          {/* Next Question Slide */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium uppercase tracking-wider text-canvas-500">
                NEXT QUESTION SLIDE {questionSlides.length > 1 && `(${questionSlides.length} queued)`}
              </span>
            </div>

            {nextQuestionSlide ? (
              <NextSlidePreview
                slide={nextQuestionSlide}
                onAccept={() => acceptSlide(nextQuestionSlide)}
                onSkip={() => skipSlide(nextQuestionSlide.id)}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-canvas-800 text-canvas-600">
                <p className="text-sm">No question slides yet</p>
              </div>
            )}
          </div>

          {/* Live transcript */}
          <div className="overflow-hidden rounded-xl border border-canvas-800 bg-canvas-900/50">
            <div className="border-b border-canvas-800 px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-canvas-600">
                {isRecording ? "Recording New Slide..." : "Slide Description"}
              </span>
            </div>
            <div className="p-4">
              {transcript ? (
                <p className="text-sm text-canvas-400">{transcript}</p>
              ) : (
                <p className="text-sm italic text-canvas-700">
                  {isRecording
                    ? "Describe your new slide idea..."
                    : "Click 'Record New Slide' to describe a new slide idea"}
                </p>
              )}
            </div>
          </div>

          {/* Audience Questions */}
          <div className="flex-1 overflow-hidden rounded-xl border border-canvas-800 bg-canvas-900/50">
            <div className="border-b border-canvas-800 px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-canvas-600">
                  Audience Questions
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-coral-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-4">
              {feedback.length === 0 ? (
                <p className="text-sm italic text-canvas-700">
                  No questions yet. Share the audience URL above.
                </p>
              ) : (
                <div className="space-y-3">
                  {feedback.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-canvas-700 bg-canvas-800/50 p-3"
                    >
                      <p className="mb-2 text-sm text-canvas-300">{item.text}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGenerateSlide(item.id, item.text)}
                          disabled={isProcessing}
                          className="rounded-lg bg-coral-500 px-3 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-coral-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Generate Slide
                        </button>
                        <button
                          onClick={() => dismissFeedback(item.id)}
                          className="rounded border border-canvas-600 px-3 py-1 text-xs font-medium text-canvas-400 transition-colors hover:bg-canvas-700 hover:text-white"
                        >
                          Dismiss
                        </button>
                        <span className="ml-auto text-xs text-canvas-600">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
      />
    </svg>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [pdfSlides, setPdfSlides] = useState<SlideData[] | undefined>(undefined);

  const handleStart = (slides?: SlideData[]) => {
    setPdfSlides(slides);
    setStarted(true);
  };

  if (!started) {
    return <SplashScreen onStart={handleStart} />;
  }

  return <PresenterView onExit={() => setStarted(false)} initialSlides={pdfSlides} />;
}

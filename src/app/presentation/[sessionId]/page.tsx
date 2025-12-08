"use client";

import { useState, useEffect } from "react";
import { use } from "react";

interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
  source?: "voice" | "question";
}

// Slide color definitions (matching page.tsx)
const slideColors: Record<string, string> = {
  ocean: "#1e40af",
  forest: "#047857",
  sunset: "#ea580c",
  plum: "#7c3aed",
  rose: "#e11d48",
  teal: "#0d9488",
};

export default function PresentationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Validate session on mount
  useEffect(() => {
    async function validateSession() {
      try {
        // We'll validate by trying to get feedback (empty response is ok)
        const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
          method: "HEAD",
        });
        setSessionValid(response.ok || response.status === 405); // 405 = method not allowed but endpoint exists
      } catch (error) {
        console.error("Error validating session:", error);
        setSessionValid(false);
      }
    }
    validateSession();
  }, [sessionId]);

  // Listen for slide updates via postMessage (for presenter's own window)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "UPDATE_SLIDE") {
        setSlide(event.data.slide);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Poll for slide updates (for remote audience members)
  useEffect(() => {
    if (!sessionValid) return;

    const pollSlides = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/slide`);
        if (response.ok) {
          const data = await response.json();
          if (data.slide) {
            setSlide(data.slide);
          }
        }
      } catch (error) {
        console.error("Error polling for slides:", error);
      }
    };

    // Poll immediately on mount
    pollSlides();

    // Then poll every 2 seconds
    const interval = setInterval(pollSlides, 2000);

    return () => clearInterval(interval);
  }, [sessionId, sessionValid]);

  // Handle feedback submission
  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: feedbackText.trim(),
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        setFeedbackText("");
        setTimeout(() => {
          setShowFeedbackModal(false);
          setSubmitSuccess(false);
        }, 1500);
      } else {
        alert("Failed to submit question. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit question. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while validating
  if (sessionValid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-900">
        <div className="text-center text-canvas-600">
          <div className="mb-4 text-4xl">...</div>
          <p className="text-xl">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Show error if session is invalid
  if (sessionValid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-900">
        <div className="text-center text-canvas-600">
          <h1 className="mb-4 text-4xl font-bold text-red-400">Session Not Found</h1>
          <p className="text-xl">This presentation session doesn't exist or has expired.</p>
          <p className="mt-4 text-sm text-canvas-700">
            Please check the URL or contact the presenter.
          </p>
        </div>
      </div>
    );
  }

  // Render slide content
  const renderSlide = () => {
    if (!slide) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas-900">
          <div className="text-center text-canvas-600">
            <h1 className="mb-4 text-4xl font-bold text-canvas-400">Slide Quest</h1>
            <p className="text-xl">Waiting for slides...</p>
            <p className="mt-4 text-sm text-canvas-700">
              The presenter will share slides shortly
            </p>
          </div>
        </div>
      );
    }

    // Render image slides
    if (slide.imageUrl) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt="Presentation Slide"
            className="max-h-[95vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      );
    }

    // Special template for audience question slides
    if (slide.source === "question") {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-coral-500 via-coral-600 to-coral-700 p-12">
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

    // Render text-based slides (voice-generated)
    if (slide.headline) {
      // Check if it's one of our named slide colors or a hex color
      const bgColor = slideColors[slide.backgroundColor || ''] || slide.backgroundColor;
      const bgStyle = bgColor?.startsWith("#") || slideColors[slide.backgroundColor || '']
        ? { backgroundColor: bgColor }
        : {};

      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center p-12"
          style={bgStyle}
        >
          <div className="max-w-4xl text-center">
            <h1 className="mb-6 text-6xl font-bold leading-tight text-white">
              {slide.headline}
            </h1>
            {slide.subheadline && (
              <p className="mb-10 text-3xl font-medium text-white opacity-90">
                {slide.subheadline}
              </p>
            )}
            {slide.bullets && slide.bullets.length > 0 && (
              <ul className="space-y-5 text-left">
                {slide.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-5 text-xl text-white">
                    <span
                      className="mt-2.5 h-3 w-3 flex-shrink-0 rounded-full opacity-70"
                      style={{ backgroundColor: bgColor || '#fff' }}
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    // Fallback for incomplete slides
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-800 text-canvas-400">
        <p>Slide data incomplete</p>
      </div>
    );
  };

  // Main presentation view
  return (
    <>
      {/* Slide Display */}
      {renderSlide()}

      {/* Floating "Ask a Question" Button */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        className="fixed bottom-6 right-6 rounded-full bg-coral-500 px-6 py-3 text-sm font-semibold text-white shadow-coral-lg transition-all duration-200 hover:scale-105 hover:bg-coral-600 hover:shadow-coral-lg"
      >
        Ask a Question
      </button>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-modal-enter rounded-2xl bg-canvas-900 p-8 shadow-2xl shadow-black/50">
            {submitSuccess ? (
              <div className="text-center">
                <div className="mb-4 text-6xl text-emerald-400">✓</div>
                <h3 className="text-2xl font-bold text-emerald-400">Question Submitted!</h3>
                <p className="mt-2 text-sm text-canvas-400">
                  The presenter will see your question
                </p>
              </div>
            ) : (
              <>
                <h3 className="mb-4 text-xl font-semibold text-white">Ask a Question</h3>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Type your question here..."
                  className="mb-4 h-32 w-full rounded-lg border border-canvas-700 bg-canvas-800 p-3 text-white placeholder-canvas-500 transition-all duration-200 focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!feedbackText.trim() || isSubmitting}
                    className="flex-1 rounded-lg bg-coral-500 px-4 py-2 font-semibold text-white transition-all duration-200 hover:bg-coral-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedbackModal(false);
                      setFeedbackText("");
                    }}
                    className="rounded-lg border border-canvas-700 px-4 py-2 font-medium text-canvas-400 transition-colors hover:bg-canvas-800/30 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

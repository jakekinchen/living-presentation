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
}

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

  // Listen for slide updates via postMessage
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="text-center text-zinc-600">
          <div className="mb-4 text-4xl">...</div>
          <p className="text-xl">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Show error if session is invalid
  if (sessionValid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="text-center text-zinc-600">
          <h1 className="mb-4 text-4xl font-bold text-red-400">Session Not Found</h1>
          <p className="text-xl">This presentation session doesn't exist or has expired.</p>
          <p className="mt-4 text-sm text-zinc-700">
            Please check the URL or contact the presenter.
          </p>
        </div>
      </div>
    );
  }

  // Main presentation view
  return (
    <>
      {/* Slide Display */}
      {!slide ? (
        <div className="flex min-h-screen items-center justify-center bg-zinc-900">
          <div className="text-center text-zinc-600">
            <h1 className="mb-4 text-4xl font-bold text-zinc-400">Living Presentation</h1>
            <p className="text-xl">Waiting for slides...</p>
            <p className="mt-4 text-sm text-zinc-700">
              The presenter will share slides shortly
            </p>
          </div>
        </div>
      ) : slide.imageUrl ? (
        <div className="flex min-h-screen items-center justify-center bg-black p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt="Presentation Slide"
            className="max-h-[95vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : (
        <div className="flex min-h-screen items-center justify-center bg-zinc-800 text-zinc-400">
          <p>Slide data incomplete (missing image)</p>
        </div>
      )}

      {/* Floating "Ask a Question" Button */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        className="fixed bottom-6 right-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        Ask a Question
      </button>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-zinc-900 p-6 shadow-2xl">
            {submitSuccess ? (
              <div className="text-center">
                <div className="mb-4 text-5xl">✓</div>
                <h3 className="text-xl font-semibold text-green-400">Question Submitted!</h3>
                <p className="mt-2 text-sm text-zinc-400">
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
                  className="mb-4 h-32 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!feedbackText.trim() || isSubmitting}
                    className="flex-1 rounded-lg bg-white px-4 py-2 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedbackModal(false);
                      setFeedbackText("");
                    }}
                    className="rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
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

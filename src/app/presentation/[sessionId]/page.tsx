"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { SlideCanvas } from "@/components/presentation/SlideCanvas";
import type { SlideData } from "@/hooks/useRealtimeAPI";
import QRCode from "react-qr-code";

export default function PresentationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [audienceUrl, setAudienceUrl] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Validate session on mount
  useEffect(() => {
    async function validateSession() {
      try {
        // Validate by fetching slide endpoint which checks session existence
        const response = await fetch(`/api/sessions/${sessionId}/slide`, {
          cache: "no-store",
        });
        setSessionValid(response.ok);
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
        setShowQRCode(event.data.showQRCode ?? false);
        setAudienceUrl(event.data.audienceUrl ?? null);
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
        const response = await fetch(`/api/sessions/${sessionId}/slide`, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.slide) {
            setSlide(data.slide);
          }
          setShowQRCode(data.showQRCode ?? false);
          setAudienceUrl(data.audienceUrl ?? null);
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
          <p className="text-xl">
            This presentation session does not exist or has expired.
          </p>
          <p className="mt-4 text-sm text-zinc-700">
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
        <div className="flex min-h-screen items-center justify-center bg-zinc-900">
          <div className="text-center text-zinc-600">
            <h1 className="mb-4 text-4xl font-bold text-zinc-400">Slidequest</h1>
            <p className="text-xl">Waiting for slides...</p>
            <p className="mt-4 text-sm text-zinc-700">
              The presenter will share slides shortly
            </p>
          </div>
        </div>
      );
    }

    // Delegate slide rendering (including audience question templating) to SlideCanvas
    return <SlideCanvas slide={slide} isFullscreen />;
  };

  // Main presentation view
  return (
    <>
      {/* Slide Display */}
      {renderSlide()}

      {/* QR Code Overlay */}
      {showQRCode && audienceUrl && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 rounded-xl bg-zinc-900/90 px-4 py-4 shadow-2xl backdrop-blur-sm border border-zinc-700 sm:bottom-8 sm:flex-row sm:gap-6 sm:rounded-2xl sm:px-8 sm:py-6">
          <div className="rounded-lg bg-white p-2 sm:rounded-xl sm:p-4">
            <QRCode value={audienceUrl} size={100} className="h-[100px] w-[100px] sm:h-[160px] sm:w-[160px]" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white sm:text-2xl">
              Scan to join the audience
            </p>
            <p className="mt-1 text-sm text-zinc-400 sm:mt-2 sm:text-lg">
              Ask questions and participate
            </p>
          </div>
        </div>
      )}

      {/* Floating "Ask a Question" Button */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        className="fixed bottom-4 right-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:bottom-6 sm:right-6 sm:px-6 sm:py-3 sm:text-sm"
      >
        Ask a Question
      </button>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl bg-zinc-900 p-4 shadow-2xl sm:p-6">
            {submitSuccess ? (
              <div className="text-center py-4">
                <div className="mb-3 text-4xl sm:mb-4 sm:text-5xl">✓</div>
                <h3 className="text-lg font-semibold text-green-400 sm:text-xl">Question Submitted!</h3>
                <p className="mt-2 text-xs text-zinc-400 sm:text-sm">
                  The presenter will see your question
                </p>
              </div>
            ) : (
              <>
                <h3 className="mb-3 text-lg font-semibold text-white sm:mb-4 sm:text-xl">Ask a Question</h3>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Type your question here..."
                  className="mb-3 h-28 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none sm:mb-4 sm:h-32 sm:text-base"
                  autoFocus
                />
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!feedbackText.trim() || isSubmitting}
                    className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedbackModal(false);
                      setFeedbackText("");
                    }}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white sm:px-4"
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

"use client";

import { useState, useEffect } from "react";

interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
}

export default function PresentationPage() {
  const [slide, setSlide] = useState<SlideData | null>(null);

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

  if (!slide) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="text-center text-zinc-600">
          <h1 className="mb-4 text-4xl font-bold text-zinc-400">Living Presentation</h1>
          <p className="text-xl">Waiting for slides...</p>
          <p className="mt-4 text-sm text-zinc-700">
            Select a slide from the presenter controls
          </p>
        </div>
      </div>
    );
  }

  if (slide.imageUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.imageUrl}
          alt="Presentation Slide"
          className="max-h-[95vh] max-w-full rounded-lg shadow-2xl object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-800 text-zinc-400">
      <p>Slide data incomplete (missing image)</p>
    </div>
  );
}
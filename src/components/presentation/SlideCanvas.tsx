import type { SlideData } from "@/types/slides";
import { getBgClass, getBgStyle, isLightColor } from "@/lib/slideColors";

interface SlideCanvasProps {
  slide: SlideData | null;
  isFullscreen?: boolean;
}

export function SlideCanvas({ slide, isFullscreen = false }: SlideCanvasProps) {
  if (!slide) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-zinc-900 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="text-center text-zinc-600 px-4">
          <div className="mb-3 text-4xl sm:mb-4 sm:text-6xl">...</div>
          <p className="text-base sm:text-xl">Waiting for first slide</p>
        </div>
      </div>
    );
  }

  // Special template for audience question slides
  if (slide.source === "question") {
    const rawQuestion = slide.originalIdea?.content || slide.headline || "";
    const cleanedQuestion = rawQuestion.replace(/^Q:\s*/i, "").trim();
    const questionText = cleanedQuestion || slide.headline || "Audience Question";

    // When we have an image (answer slide), show the question header plus the image
    if (slide.imageUrl) {
      return (
        <div
          className={`flex h-full w-full flex-col items-center justify-center bg-black p-4 sm:p-10 ${
            isFullscreen ? "min-h-screen" : ""
          }`}
        >
          <div className="flex w-full max-w-6xl flex-col gap-3 sm:gap-6">
            {/* Question label and text */}
            <div className="rounded-xl border border-blue-500/60 bg-blue-950/80 px-4 py-3 shadow-lg sm:rounded-2xl sm:px-6 sm:py-4">
              <div className="mb-1 flex items-center gap-2 sm:mb-2 sm:gap-3">
                <svg
                  className="h-4 w-4 text-blue-300 sm:h-6 sm:w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-200 sm:text-xs sm:tracking-[0.2em]">
                  Audience Question
                </span>
              </div>
              <p className="text-sm font-semibold leading-relaxed text-blue-50 sm:text-lg">
                &ldquo;{questionText}&rdquo;
              </p>
            </div>

            {/* Answer image */}
            <div className="flex flex-1 items-center justify-center rounded-xl bg-zinc-950/80 p-2 sm:rounded-2xl sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.imageUrl}
                alt="Answer to audience question"
                className="max-h-[50vh] w-full max-w-full rounded-lg object-contain shadow-2xl sm:max-h-[60vh] sm:rounded-xl"
              />
            </div>
          </div>
        </div>
      );
    }

    // Fallback: question-only slide when we don't have an image yet
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center p-6 bg-blue-600 sm:p-12 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="max-w-5xl w-full">
          {/* Question Icon and Label */}
          <div className="mb-4 flex items-center justify-center gap-2 sm:mb-8 sm:gap-3">
            <svg className="h-8 w-8 text-blue-200 sm:h-12 sm:w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-lg font-semibold uppercase tracking-wider text-blue-200 sm:text-2xl">
              Audience Question
            </span>
          </div>

          {/* Question Text */}
          <div className="rounded-xl border-2 border-blue-400 bg-white p-6 shadow-2xl sm:rounded-2xl sm:border-4 sm:p-12">
            <p className="text-center text-xl font-bold leading-relaxed text-blue-900 sm:text-4xl">
              &ldquo;{questionText}&rdquo;
            </p>
          </div>
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

  const bgClass = getBgClass(slide.backgroundColor || "zinc");
  const bgStyle = getBgStyle(slide.backgroundColor || "zinc");
  const isLight = isLightColor(slide.backgroundColor || "zinc");

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center p-6 sm:p-12 ${bgClass} ${isFullscreen ? "min-h-screen" : ""}`}
      style={bgStyle}
    >
      <div className="max-w-4xl text-center">
        <h1 className={`mb-3 text-2xl font-bold leading-tight sm:mb-6 sm:text-5xl ${isLight ? "text-zinc-900" : "text-white"}`}>
          {slide.headline}
        </h1>
        {slide.subheadline && (
          <p className={`mb-4 text-base sm:mb-8 sm:text-2xl ${isLight ? "text-zinc-600" : "text-zinc-300"}`}>
            {slide.subheadline}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="space-y-2 text-left sm:space-y-4">
            {slide.bullets.map((bullet, i) => (
              <li key={i} className={`flex items-start gap-2 text-sm sm:gap-4 sm:text-xl ${isLight ? "text-zinc-700" : "text-zinc-200"}`}>
                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full sm:mt-2 sm:h-2 sm:w-2 ${isLight ? "bg-zinc-400" : "bg-zinc-500"}`} />
                {bullet}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

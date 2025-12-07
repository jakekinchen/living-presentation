import { SlideData, ChannelType } from "@/hooks/useRealtimeAPI";
import { getBgClass, getBgStyle, isLightColor } from "@/lib/slideColors";
import { ChevronLeftIcon, ChevronRightIcon, QuestionIcon } from "./Icons";

interface ChannelInfo {
  total: number;
  currentIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
}

interface ChannelOptionProps {
  channel: ChannelType;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  currentSlide: SlideData | null;
  channelInfo: ChannelInfo;
  onNavigate: (direction: "prev" | "next") => void;
  onUse: () => void;
  isProcessing?: boolean;
  isRecording?: boolean;
  emptyMessage?: string;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
}

export function ChannelOption({
  label,
  icon,
  accentColor,
  currentSlide,
  channelInfo,
  onNavigate,
  onUse,
  isProcessing,
  emptyMessage,
  onEmptyAction,
  emptyActionLabel,
}: ChannelOptionProps) {
  const hasSlides = channelInfo.total > 0;

  return (
    <div className={`flex flex-col rounded-xl border ${accentColor} bg-zinc-900/50 p-3`}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {label}
          </span>
        </div>
        {hasSlides && (
          <span className="text-xs text-zinc-500">
            {channelInfo.currentIndex + 1}/{channelInfo.total}
          </span>
        )}
      </div>

      {/* Slide Preview */}
      {currentSlide ? (
        <div className="relative">
          {currentSlide.imageUrl ? (
            <div className="aspect-video overflow-hidden rounded-lg border border-zinc-700 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentSlide.imageUrl}
                alt="Slide Preview"
                className="h-full w-full object-contain"
              />
            </div>
          ) : currentSlide.source === "question" ? (
            <div className="aspect-video overflow-hidden rounded-lg border border-zinc-700 bg-blue-600">
              <div className="flex h-full flex-col items-center justify-center p-3 text-center">
                <QuestionIcon className="mb-1 h-5 w-5 text-blue-200" />
                <p className="line-clamp-3 text-xs font-bold leading-tight text-white">
                  {currentSlide.headline}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`aspect-video overflow-hidden rounded-lg border border-zinc-700 ${getBgClass(currentSlide.backgroundColor || "zinc")}`}
              style={getBgStyle(currentSlide.backgroundColor || "zinc")}
            >
              <div className="flex h-full flex-col items-center justify-center p-3 text-center">
                <h3 className={`text-xs font-bold leading-tight ${isLightColor(currentSlide.backgroundColor || "zinc") ? "text-zinc-900" : "text-white"}`}>
                  {currentSlide.headline}
                </h3>
                {currentSlide.subheadline && (
                  <p className={`mt-1 text-[10px] ${isLightColor(currentSlide.backgroundColor || "zinc") ? "text-zinc-600" : "text-zinc-400"}`}>
                    {currentSlide.subheadline}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50">
          {onEmptyAction ? (
            <button
              type="button"
              onClick={onEmptyAction}
              className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/70 px-3 py-2 text-center text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
            >
              <span className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {emptyActionLabel || "Add idea"}
              </span>
              <span className="text-[11px] text-zinc-500">
                {isProcessing ? "Generating..." : emptyMessage}
              </span>
            </button>
          ) : (
            <p className="px-2 text-center text-xs text-zinc-600">
              {isProcessing ? "Generating..." : emptyMessage || "Empty"}
            </p>
          )}
        </div>
      )}

      {/* Navigation and Use button */}
      <div className="mt-2 flex items-center gap-1">
        {/* Left arrow */}
        <button
          onClick={() => onNavigate("prev")}
          disabled={!channelInfo.canGoPrev}
          className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-3 w-3" />
        </button>

        {/* Use button */}
        <button
          onClick={onUse}
          disabled={!currentSlide}
          className="flex-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use
        </button>

        {/* Right arrow */}
        <button
          onClick={() => onNavigate("next")}
          disabled={!channelInfo.canGoNext}
          className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRightIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

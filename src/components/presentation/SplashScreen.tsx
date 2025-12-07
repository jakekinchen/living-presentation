import { MicIcon } from "./Icons";

interface SplashScreenProps {
  onStart: () => void;
}

export function SplashScreen({ onStart }: SplashScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-4 sm:gap-8">
      <div className="text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:mb-4 sm:text-5xl">
          Slidequest
        </h1>
        <p className="max-w-md text-base text-zinc-400 sm:text-lg">
          Speak your ideas. Watch them become slides.
        </p>
      </div>

      <button
        onClick={onStart}
        className="group relative overflow-hidden rounded-full bg-white px-8 py-3 text-base font-semibold text-zinc-900 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-white/20 sm:px-12 sm:py-4 sm:text-lg"
      >
        <span className="relative z-10">Start Presenting</span>
        <div className="absolute inset-0 -z-0 bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="absolute inset-0 z-10 flex items-center justify-center text-white opacity-0 transition-opacity group-hover:opacity-100">
          Start Presenting
        </span>
      </button>

      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500 sm:mt-8 sm:text-sm">
        <MicIcon className="h-4 w-4" />
        <span>Microphone access required</span>
      </div>
    </div>
  );
}

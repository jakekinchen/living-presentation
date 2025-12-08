interface LogoProps {
  variant?: "default" | "dark" | "light" | "gradient";
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
  className?: string;
}

export function Logo({
  variant = "default",
  size = "md",
  animated = false,
  className = "",
}: LogoProps) {
  const sizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  };

  const colors = {
    default: "text-coral-500",
    dark: "text-coral-400",
    light: "text-coral-600",
    gradient: "",
  };

  const colorClass = variant === "gradient" ? "" : colors[variant];

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizes[size]} ${colorClass} ${className} ${animated ? "transition-transform duration-300 hover:scale-110" : ""}`}
      aria-label="SlideQuest Logo"
    >
      {variant === "gradient" ? (
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff8a6d" />
            <stop offset="50%" stopColor="#ff6347" />
            <stop offset="100%" stopColor="#f04a2f" />
          </linearGradient>
        </defs>
      ) : null}

      <g stroke={variant === "gradient" ? "url(#logoGradient)" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Sound waves (left side) - representing voice input */}
        <path
          d="M 8 18 Q 10 16, 12 18 Q 14 20, 16 18"
          fill="none"
          opacity="0.6"
        />
        <path
          d="M 6 24 Q 9 20, 12 24 Q 15 28, 18 24"
          fill="none"
          opacity="0.8"
        />
        <path
          d="M 8 30 Q 10 28, 12 30 Q 14 32, 16 30"
          fill="none"
          opacity="0.6"
        />

        {/* Transformation flow - organic curves connecting waves to slide */}
        <path
          d="M 18 24 Q 22 22, 26 24"
          fill="none"
          opacity="0.5"
          strokeDasharray="2 2"
        />

        {/* Presentation slide (right side) - geometric rectangle */}
        <rect
          x="28"
          y="14"
          width="14"
          height="20"
          rx="1.5"
          fill="none"
          strokeWidth="2.5"
        />

        {/* Slide content lines - representing structured output */}
        <line x1="31" y1="19" x2="39" y2="19" strokeWidth="1.5" opacity="0.7" />
        <line x1="31" y1="24" x2="39" y2="24" strokeWidth="1.5" opacity="0.7" />
        <line x1="31" y1="29" x2="37" y2="29" strokeWidth="1.5" opacity="0.5" />
      </g>
    </svg>
  );
}

type CryptivaLogoProps = {
  variant?: "auth" | "navbar" | "icon";
  className?: string;
};

const sizeClassByVariant: Record<NonNullable<CryptivaLogoProps["variant"]>, string> = {
  auth: "w-[220px] sm:w-[250px]",
  navbar: "w-[138px] sm:w-[150px]",
  icon: "w-8 h-8",
};

const CryptivaLogo = ({ variant = "auth", className = "" }: CryptivaLogoProps) => {
  if (variant === "icon") {
    return (
      <div className={`cryptiva-logo ${sizeClassByVariant[variant]} ${className}`}>
        <svg viewBox="0 0 88 88" role="img" aria-label="Cryptiva logo icon" className="h-full w-full drop-shadow-[0_0_14px_rgba(34,211,238,0.35)]">
          <defs>
            <linearGradient id="coinFillIcon" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="48%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <radialGradient id="coinCoreIcon" cx="35%" cy="30%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="50%" stopColor="rgba(56,189,248,0.4)" />
              <stop offset="100%" stopColor="rgba(2,6,23,0.1)" />
            </radialGradient>
            <filter id="coinGlowIcon" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g className="cryptiva-logo__coin" transform="translate(0 0)">
            <ellipse cx="44" cy="73" rx="31" ry="8" fill="rgba(56,189,248,0.25)" />
            <ellipse cx="44" cy="44" rx="34" ry="34" fill="url(#coinFillIcon)" filter="url(#coinGlowIcon)" />
            <ellipse cx="44" cy="44" rx="26" ry="26" fill="url(#coinCoreIcon)" />
            <path
              d="M55 33c-3-5-8-8-14-8-10 0-18 8-18 19s8 19 18 19c6 0 11-3 14-8"
              fill="none"
              stroke="rgba(240,249,255,0.92)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path d="M22 44h26" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className={`cryptiva-logo ${sizeClassByVariant[variant]} ${className}`}>
      <svg viewBox="0 0 320 112" role="img" aria-label="Cryptiva logo" className="w-full drop-shadow-[0_0_22px_rgba(34,211,238,0.35)]">
        <defs>
          <linearGradient id="coinFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="48%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <radialGradient id="coinCore" cx="35%" cy="30%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="50%" stopColor="rgba(56,189,248,0.4)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.1)" />
          </radialGradient>
          <linearGradient id="textFill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="46%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
          <filter id="coinGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="cryptiva-logo__coin" transform="translate(12 12)">
          <ellipse cx="44" cy="58" rx="31" ry="8" fill="rgba(56,189,248,0.25)" />
          <ellipse cx="44" cy="29" rx="34" ry="34" fill="url(#coinFill)" filter="url(#coinGlow)" />
          <ellipse cx="44" cy="29" rx="26" ry="26" fill="url(#coinCore)" />
          <path
            d="M55 18c-3-5-8-8-14-8-10 0-18 8-18 19s8 19 18 19c6 0 11-3 14-8"
            fill="none"
            stroke="rgba(240,249,255,0.92)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="M22 29h26" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
        </g>

        <g className="cryptiva-logo__wordmark" transform="translate(96 68)">
          <text
            x="0"
            y="0"
            fill="url(#textFill)"
            fontSize="34"
            fontWeight="700"
            letterSpacing="4.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            CRYPTIVA
          </text>
          <text
            x="1"
            y="-2"
            fill="rgba(224,242,254,0.6)"
            fontSize="34"
            fontWeight="700"
            letterSpacing="4.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            CRYPTIVA
          </text>
        </g>
      </svg>
    </div>
  );
};

export default CryptivaLogo;

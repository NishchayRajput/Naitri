import { cn } from "@/lib/utils"

/**
 * The mark is three concentric arcs — a signal radiating outward — rather than
 * another camera glyph. It reads at 20px and does not rely on colour.
 */
export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="naitri-mark" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" stroke="url(#naitri-mark)" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3" fill="url(#naitri-mark)" />
      <path d="M21.5 10.5a7.8 7.8 0 0 1 0 11" stroke="url(#naitri-mark)" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.5 21.5a7.8 7.8 0 0 1 0-11" stroke="url(#naitri-mark)" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <path d="M25 7a12.7 12.7 0 0 1 0 18" stroke="url(#naitri-mark)" strokeWidth="1.75" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo size={28} />
      <span className="text-[17px] font-semibold tracking-tight text-foreground">Naitri</span>
    </span>
  )
}

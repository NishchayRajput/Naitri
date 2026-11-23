import { cn } from "@/lib/utils"

/**
 * The mark is a lime tile carrying a broadcast glyph: a dot with arcs
 * radiating outward. It reads at 20px and keeps its shape in monochrome.
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
      <rect width="32" height="32" rx="10" fill="var(--brand)" />
      <circle cx="16" cy="16" r="3.2" fill="var(--brand-ink)" />
      <path d="M21.2 10.8a7.4 7.4 0 0 1 0 10.4" stroke="var(--brand-ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10.8 21.2a7.4 7.4 0 0 1 0-10.4" stroke="var(--brand-ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24.6 7.4a12.2 12.2 0 0 1 0 17.2" stroke="var(--brand-ink)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <path d="M7.4 24.6a12.2 12.2 0 0 1 0-17.2" stroke="var(--brand-ink)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo size={30} />
      <span className="text-[18px] font-semibold tracking-tight text-foreground">naitri</span>
    </span>
  )
}

import { cn } from "@/lib/utils"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Initials avatar tinted with the user's stable account colour. The tint is a
 * low-opacity wash rather than a solid fill so it sits calmly on dark tiles.
 */
export function InitialsAvatar({
  name,
  color,
  size = 40,
  className,
}: {
  name: string
  color: string
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold uppercase tracking-wide select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color,
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 38%, transparent)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

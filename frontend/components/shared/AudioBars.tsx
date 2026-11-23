import { cn } from "@/lib/utils"

/**
 * Small animated equaliser shown next to whoever is speaking. It is a
 * presence cue, not a meter: it animates whenever `active` is true.
 */
export function AudioBars({
  active,
  className,
  bars = 3,
}: {
  active: boolean
  className?: string
  bars?: number
}) {
  return (
    <span className={cn("inline-flex h-3 items-end gap-[2px]", className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-current"
          style={{
            height: "100%",
            transform: active ? undefined : "scaleY(0.3)",
            animation: active ? `eq ${0.7 + i * 0.15}s ease-in-out ${i * 0.12}s infinite` : undefined,
          }}
        />
      ))}
    </span>
  )
}

"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/shared/Logo"
import { AudioBars } from "@/components/shared/AudioBars"
import {
  Hand, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Video,
} from "lucide-react"

/**
 * Decorative, self-running mock of a call. It shows the product instead of
 * describing it: tiles, a speaking ring that moves between people, a raised
 * hand and chat. Nothing here is interactive, so it is hidden from assistive
 * technology.
 */

const PEOPLE = [
  { name: "Maya", from: "#f472b6", to: "#7c3aed", muted: false },
  { name: "Leo", from: "#2dd4bf", to: "#0e7490", muted: true },
  { name: "Aarav", from: "#fbbf24", to: "#c2410c", muted: false, hand: true },
  { name: "Sofia", from: "#60a5fa", to: "#4338ca", muted: false },
]

// Order in which people "speak", skipping the muted one.
const SPEAKING_ORDER = [0, 3, 2, 0, 3]

export function HeroStage({ className }: { className?: string }) {
  const [tick, setTick] = useState(0)
  const [seconds, setSeconds] = useState(24 * 60 + 18)

  useEffect(() => {
    const speak = setInterval(() => setTick((t) => t + 1), 2600)
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => {
      clearInterval(speak)
      clearInterval(clock)
    }
  }, [])

  const speaking = SPEAKING_ORDER[tick % SPEAKING_ORDER.length]
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0")
  const ss = String(seconds % 60).padStart(2, "0")

  return (
    <div className={cn("relative select-none", className)} aria-hidden>
      {/* Glow under the window. */}
      <div className="absolute -inset-x-10 -bottom-10 top-10 rounded-full bg-brand/10 blur-3xl" />

      <div className="signal-border relative rounded-[28px] bg-surface/90 p-3 shadow-float backdrop-blur">
        {/* Window chrome */}
        <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
          <Logo size={20} />
          <span className="text-[13px] font-medium text-foreground">Weekly sync</span>
          <span className="font-mono text-[11px] text-muted-foreground">kpm-4rtx-dz9</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5 rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
            <span className="size-1.5 animate-blink rounded-full bg-brand" />
            Live
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {mm}:{ss}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {PEOPLE.map((p, i) => (
            <MockTile key={p.name} person={p} speaking={i === speaking} />
          ))}
        </div>

        {/* Mini control dock */}
        <div className="mt-3 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-stroke bg-black/30 p-1.5">
            {[Mic, Video, MonitorUp, MessageSquare].map((Icon, i) => (
              <span
                key={i}
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  i === 3 ? "bg-brand text-brand-ink" : "bg-white/7 text-foreground/80",
                )}
              >
                <Icon className="size-3.5" />
              </span>
            ))}
            <span className="ml-1 grid h-8 place-items-center rounded-full bg-destructive px-3 text-white">
              <PhoneOff className="size-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Floating chat bubble */}
      <div className="absolute -right-4 bottom-20 hidden w-56 animate-float sm:block lg:-right-10">
        <div className="glass-high rounded-2xl rounded-br-md p-3 shadow-float">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-violet-600 text-[10px] font-bold text-white">
              M
            </span>
            <span className="text-[12px] font-semibold text-foreground">Maya</span>
            <span className="text-[10px] text-muted-foreground">now</span>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-foreground/85">
            Sharing the new designs in a sec ✨
          </p>
        </div>
      </div>

      {/* Floating join toast */}
      <div className="absolute -left-6 top-16 hidden animate-float-slow sm:block lg:-left-12">
        <div className="glass-high flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5 shadow-float">
          <span className="flex -space-x-2">
            {["from-teal-300 to-cyan-700", "from-amber-300 to-orange-700", "from-sky-400 to-indigo-700"].map((g) => (
              <span key={g} className={cn("size-6 rounded-full bg-gradient-to-br ring-2 ring-surface-high", g)} />
            ))}
          </span>
          <span className="text-[12px] font-medium text-foreground">3 people joined</span>
        </div>
      </div>
    </div>
  )
}

function MockTile({
  person,
  speaking,
}: {
  person: (typeof PEOPLE)[number]
  speaking: boolean
}) {
  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-[18px] transition-shadow duration-500",
        speaking ? "speaking-glow" : "ring-1 ring-stroke",
      )}
      style={{
        background: `radial-gradient(120% 90% at 30% 15%, ${person.from}, ${person.to} 70%, #0b0b10)`,
      }}
    >
      {/* Head-and-shoulders silhouette so the tile reads as a person on camera. */}
      <svg viewBox="0 0 200 150" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice">
        <circle cx="100" cy="62" r="26" fill="white" fillOpacity="0.22" />
        <path d="M44 150c4-34 28-52 56-52s52 18 56 52Z" fill="white" fillOpacity="0.18" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

      {person.hand && (
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-hand px-2 py-0.5 text-[10px] font-semibold text-black/80">
          <Hand className="size-3 origin-bottom animate-wave" />
          Hand
        </span>
      )}

      <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-md">
        {person.muted ? (
          <MicOff className="size-3 text-destructive" />
        ) : (
          <AudioBars active={speaking} className={speaking ? "text-brand" : "text-white/60"} />
        )}
        {person.name}
      </span>
    </div>
  )
}

"use client"

import Link from "next/link"
import { Wordmark } from "@/components/shared/Logo"
import { cn } from "@/lib/utils"
import { ArrowLeft, Ban, Lock, PhoneOff, RotateCcw, SearchX, Users } from "lucide-react"

/** Pick an icon and tone from the title so every exit reads at a glance. */
function iconFor(title: string): { icon: React.ReactNode; tone: string } {
  const t = title.toLowerCase()
  if (t.includes("removed")) return { icon: <Ban />, tone: "bg-destructive/12 text-destructive" }
  if (t.includes("locked")) return { icon: <Lock />, tone: "bg-hand/12 text-hand" }
  if (t.includes("full")) return { icon: <Users />, tone: "bg-hand/12 text-hand" }
  if (t.includes("not found")) return { icon: <SearchX />, tone: "bg-white/8 text-muted-foreground" }
  return { icon: <PhoneOff />, tone: "bg-brand/12 text-brand" }
}

export function MeetingEnded({
  title,
  detail,
  roomCode,
}: {
  title: string
  detail: string
  roomCode: string
}) {
  const { icon, tone } = iconFor(title)
  // Rejoining makes no sense when you were removed or the code is wrong.
  const canRejoin = !/removed|not found|ended/i.test(title)

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-5 grain">
      <div className="ambient" />

      <div className="relative z-10 w-full max-w-md text-center animate-rise">
        <div className="mb-10 flex justify-center">
          <Link href="/" aria-label="Home">
            <Wordmark />
          </Link>
        </div>

        <div className="glass lit-edge rounded-[28px] px-7 py-9 shadow-float">
          <span className={cn("mx-auto grid size-16 place-items-center rounded-2xl [&_svg]:size-7", tone)}>
            {icon}
          </span>

          <h1 className="mt-6 text-balance text-[28px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">
            {/* Server messages are lowercase fragments; present them as sentences. */}
            {detail.charAt(0).toUpperCase() + detail.slice(1)}
          </p>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            {canRejoin && (
              <Link
                href={`/room/${roomCode}`}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-stroke px-5 text-[14px] font-medium text-foreground transition-colors hover:bg-white/5"
              >
                <RotateCcw className="size-4" />
                Rejoin
              </Link>
            )}
            <Link
              href="/"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-[14px] font-semibold text-brand-ink shadow-[0_10px_40px_-12px_var(--brand)] transition-all hover:-translate-y-0.5"
            >
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import Link from "next/link"
import { Wordmark } from "@/components/shared/Logo"

export function MeetingEnded({
  title,
  detail,
  roomCode,
}: {
  title: string
  detail: string
  roomCode: string
}) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 grain">
      <div className="aurora" />

      <div className="relative z-10 w-full max-w-md text-center animate-rise">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href={`/room/${roomCode}`}
            className="h-11 rounded-xl border border-stroke px-5 text-sm font-medium leading-[2.75rem] text-foreground transition-colors hover:bg-white/5"
          >
            Rejoin
          </Link>
          <Link
            href="/"
            className="h-11 rounded-xl bg-brand px-5 text-sm font-semibold leading-[2.75rem] text-primary-foreground transition-all hover:brightness-110"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/shared/Logo"
import type { SignalingStatus } from "@/lib/signaling"
import { Check, Copy, Lock } from "lucide-react"

function useElapsed(since: number): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const total = Math.max(0, Math.floor((now - since) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function MeetingHeader({
  roomName,
  roomCode,
  locked,
  status,
  joinedAt,
}: {
  roomName: string
  roomCode: string
  locked: boolean
  status: SignalingStatus
  joinedAt: number
}) {
  const [copied, setCopied] = useState(false)
  const elapsed = useElapsed(joinedAt)

  const copy = async () => {
    try {
      // Share the full link rather than the bare code: it is what people
      // actually need to paste into a calendar invite or a chat.
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked by permissions policy; the code is visible
      // on screen either way.
    }
  }

  return (
    <header className="z-20 flex shrink-0 items-center gap-3 px-4 py-3">
      <Logo size={26} />

      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-sm font-semibold text-foreground">{roomName}</h1>
        {locked && <Lock className="size-3 shrink-0 text-amber-300/90" aria-label="Locked" />}
      </div>

      <button
        type="button"
        onClick={copy}
        className="group hidden items-center gap-2 rounded-lg border border-stroke bg-white/4 px-2.5 py-1.5 text-xs transition-colors hover:border-stroke-strong hover:bg-white/8 sm:flex"
        aria-label="Copy meeting link"
      >
        <span className="font-mono tracking-wide text-muted-foreground group-hover:text-foreground">
          {roomCode}
        </span>
        {copied ? (
          <Check className="size-3 text-live" />
        ) : (
          <Copy className="size-3 text-muted-foreground" />
        )}
      </button>

      <span className="flex-1" />

      <ConnectionPill status={status} />

      <time className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {elapsed}
      </time>
    </header>
  )
}

function ConnectionPill({ status }: { status: SignalingStatus }) {
  const config = {
    open: { label: "Live", dot: "bg-live", text: "text-live" },
    connecting: { label: "Connecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-300" },
    reconnecting: { label: "Reconnecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-300" },
    closed: { label: "Disconnected", dot: "bg-destructive", text: "text-destructive" },
  }[status]

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-stroke bg-white/4 px-2.5 py-1 text-[11px] font-medium",
        config.text,
      )}
      role="status"
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  )
}

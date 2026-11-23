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
    <header className="z-20 flex shrink-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
      <div className="glass flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-2 sm:pr-1.5">
        <Logo size={28} />
        <h1 className="truncate text-[14px] font-semibold text-foreground">{roomName}</h1>
        {locked && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-hand/15 px-2 py-0.5 text-[11px] font-medium text-hand">
            <Lock className="size-3" aria-hidden />
            Locked
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className={cn(
            "group hidden shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors sm:flex",
            copied ? "bg-brand/15 text-brand" : "bg-white/6 text-muted-foreground hover:bg-white/10 hover:text-foreground",
          )}
          aria-label="Copy meeting link"
        >
          <span className="font-mono tracking-wide">{copied ? "Link copied" : roomCode}</span>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>

      <span className="flex-1" />

      <div className="glass flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5">
        <ConnectionPill status={status} />
        <time className="hidden font-mono text-[12px] tabular-nums text-muted-foreground sm:block">
          {elapsed}
        </time>
      </div>
    </header>
  )
}

function ConnectionPill({ status }: { status: SignalingStatus }) {
  const config = {
    open: { label: "Live", cls: "bg-brand/15 text-brand", dot: "bg-brand animate-blink" },
    connecting: { label: "Connecting", cls: "bg-hand/15 text-hand", dot: "bg-hand animate-pulse" },
    reconnecting: { label: "Reconnecting", cls: "bg-hand/15 text-hand", dot: "bg-hand animate-pulse" },
    closed: { label: "Offline", cls: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
  }[status]

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        config.cls,
      )}
      role="status"
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  )
}

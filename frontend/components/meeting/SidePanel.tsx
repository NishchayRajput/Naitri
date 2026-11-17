"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { InitialsAvatar } from "@/components/shared/Avatar"
import type { RosterEntry } from "./VideoGrid"
import type { ChatMessage } from "@/types/signaling"
import { Crown, Hand, MicOff, MonitorUp, SendHorizonal, UserMinus, X } from "lucide-react"

interface SidePanelProps {
  panel: "chat" | "people"
  onClose: () => void
  onSwitch: (panel: "chat" | "people") => void
  messages: ChatMessage[]
  roster: RosterEntry[]
  selfPeerId: string | null
  isHost: boolean
  onSend: (text: string) => void
  onRemovePeer: (peerId: string) => void
}

export function SidePanel(props: SidePanelProps) {
  return (
    <aside className="glass flex h-full w-full flex-col rounded-2xl animate-rise lg:w-[340px]">
      <header className="flex items-center gap-1 border-b border-stroke p-2">
        {(["chat", "people"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => props.onSwitch(p)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
              props.panel === p
                ? "bg-white/8 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p === "chat" ? "Chat" : `People · ${props.roster.length}`}
          </button>
        ))}
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close panel"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      {props.panel === "chat" ? (
        <ChatPane
          messages={props.messages}
          selfPeerId={props.selfPeerId}
          onSend={props.onSend}
        />
      ) : (
        <PeoplePane
          roster={props.roster}
          isHost={props.isHost}
          selfPeerId={props.selfPeerId}
          onRemovePeer={props.onRemovePeer}
        />
      )}
    </aside>
  )
}

function ChatPane({
  messages,
  selfPeerId,
  onSend,
}: {
  messages: ChatMessage[]
  selfPeerId: string | null
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  // Only auto-scroll when the reader is already at the bottom, so a new
  // message does not yank them away from older history they are reading.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft)
    setDraft("")
    pinnedToBottom.current = true
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            No messages yet.
            <br />
            <span className="text-xs text-muted-foreground/70">
              Messages are visible to everyone in this meeting.
            </span>
          </p>
        )}

        {messages.map((msg, i) => {
          const isSelf = msg.peerId === selfPeerId
          // Group consecutive messages from one person within two minutes.
          const prev = messages[i - 1]
          const grouped =
            prev?.peerId === msg.peerId &&
            new Date(msg.at).getTime() - new Date(prev.at).getTime() < 120_000

          return (
            <div key={msg.id} className={cn("flex gap-2.5", grouped && "mt-1")}>
              <div className="w-8 shrink-0">
                {!grouped && (
                  <InitialsAvatar name={msg.name} color={msg.avatarColor} size={32} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {isSelf ? "You" : msg.name}
                    </span>
                    <time className="text-[10px] text-muted-foreground/70">
                      {new Date(msg.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                )}
                <p className="break-words text-[13px] leading-relaxed text-foreground/90">
                  {msg.text}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="border-t border-stroke p-3">
        <div className="flex items-end gap-2 rounded-xl border border-stroke bg-black/30 p-1.5 transition-colors focus-within:border-brand/50">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit(e)
              }
            }}
            rows={1}
            placeholder="Send a message"
            maxLength={2000}
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-primary-foreground transition-all hover:brightness-110 disabled:bg-white/5 disabled:text-muted-foreground"
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
      </form>
    </>
  )
}

function PeoplePane({
  roster,
  isHost,
  selfPeerId,
  onRemovePeer,
}: {
  roster: RosterEntry[]
  isHost: boolean
  selfPeerId: string | null
  onRemovePeer: (peerId: string) => void
}) {
  // Raised hands first, then speakers, so the host sees who needs attention.
  const sorted = [...roster].sort((a, b) => {
    const score = (e: RosterEntry) =>
      (e.participant.state.handRaised ? 2 : 0) + (e.participant.state.speaking ? 1 : 0)
    return score(b) - score(a)
  })

  return (
    <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {sorted.map(({ participant, isSelf }) => (
        <div
          key={participant.peerId}
          className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
        >
          <div className="relative">
            <InitialsAvatar name={participant.name} color={participant.avatarColor} size={36} />
            {participant.state.speaking && participant.state.micOn && (
              <span className="absolute -inset-0.5 rounded-full ring-2 ring-live animate-pulse-ring" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-foreground">
                {isSelf ? "You" : participant.name}
              </span>
              {participant.isHost && (
                <Crown className="size-3 shrink-0 text-amber-300/90" aria-label="Host" />
              )}
            </div>
            {participant.state.screenOn && (
              <span className="flex items-center gap-1 text-[11px] text-brand">
                <MonitorUp className="size-2.5" />
                Presenting
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            {participant.state.handRaised && (
              <Hand className="size-3.5 text-amber-300" aria-label="Hand raised" />
            )}
            {!participant.state.micOn && (
              <MicOff className="size-3.5 text-destructive/80" aria-label="Muted" />
            )}

            {isHost && !isSelf && participant.peerId !== selfPeerId && (
              <button
                type="button"
                onClick={() => onRemovePeer(participant.peerId)}
                aria-label={`Remove ${participant.name}`}
                title={`Remove ${participant.name}`}
                className="grid size-7 place-items-center rounded-lg opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <UserMinus className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

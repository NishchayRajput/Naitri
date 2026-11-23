"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { InitialsAvatar } from "@/components/shared/Avatar"
import type { RosterEntry } from "./VideoGrid"
import type { ChatMessage } from "@/types/signaling"
import { AudioBars } from "@/components/shared/AudioBars"
import { Crown, Hand, MessageSquare, MicOff, MonitorUp, SendHorizonal, UserMinus, X } from "lucide-react"

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
    <aside className="glass flex h-full w-full flex-col overflow-hidden rounded-[24px] shadow-float animate-rise lg:w-[360px]">
      <header className="flex items-center gap-2 p-2.5">
        <div className="relative grid flex-1 grid-cols-2 rounded-2xl bg-black/30 p-1" role="tablist">
          <span
            className={cn(
              "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-surface-high ring-1 ring-stroke transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              props.panel === "people" && "translate-x-full",
            )}
            aria-hidden
          />
          {(["chat", "people"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={props.panel === p}
              onClick={() => props.onSwitch(p)}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                props.panel === p ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "chat" ? "Chat" : "People"}
              {p === "people" && (
                <span className="rounded-full bg-white/8 px-1.5 text-[11px] tabular-nums">{props.roster.length}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close panel"
          className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
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
        className="flex-1 overflow-y-auto px-3.5 pb-3 pt-1"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
              <MessageSquare className="size-5" />
            </span>
            <p className="mt-4 text-[14px] font-medium text-foreground">No messages yet</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Say hi! Messages are visible to everyone in the meeting.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isSelf = msg.peerId === selfPeerId
          // Group consecutive messages from one person within two minutes.
          const prev = messages[i - 1]
          const grouped =
            prev?.peerId === msg.peerId &&
            new Date(msg.at).getTime() - new Date(prev.at).getTime() < 120_000

          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2 animate-rise [animation-duration:0.35s]",
                isSelf ? "flex-row-reverse" : "flex-row",
                grouped ? "mt-1" : "mt-4",
              )}
            >
              {!isSelf && (
                <div className="w-7 shrink-0 self-end">
                  {!grouped && <InitialsAvatar name={msg.name} color={msg.avatarColor} size={28} />}
                </div>
              )}
              <div className={cn("flex min-w-0 max-w-[78%] flex-col", isSelf ? "items-end" : "items-start")}>
                {!grouped && (
                  <div className={cn("mb-1 flex items-baseline gap-2 px-1", isSelf && "flex-row-reverse")}>
                    <span className="text-[12px] font-semibold text-foreground/90">
                      {isSelf ? "You" : msg.name}
                    </span>
                    <time className="text-[10px] text-muted-foreground/70">
                      {new Date(msg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                )}
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
                    isSelf
                      ? "rounded-br-md bg-brand text-brand-ink"
                      : "rounded-bl-md bg-white/[0.07] text-foreground/95",
                  )}
                >
                  {msg.text}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="p-2.5 pt-1">
        <div className="flex items-end gap-2 rounded-2xl border border-stroke bg-black/30 p-1.5 transition-all focus-within:border-brand/60 focus-within:shadow-[0_0_0_4px_var(--brand-soft)]">
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
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink transition-all hover:brightness-105 active:scale-95 disabled:bg-white/5 disabled:text-muted-foreground"
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
    <div className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-3">
      {sorted.map(({ participant, isSelf }) => {
        const speaking = participant.state.speaking && participant.state.micOn
        return (
          <div
            key={participant.peerId}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/5",
              participant.state.handRaised && "bg-hand/[0.07]",
            )}
          >
            <span className={cn("rounded-full", speaking && "animate-pulse-ring")}>
              <InitialsAvatar name={participant.name} color={participant.avatarColor} size={38} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-medium text-foreground">
                  {participant.name}
                </span>
                {isSelf && <span className="text-[12px] text-muted-foreground">(you)</span>}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                {participant.isHost && (
                  <span className="flex items-center gap-1 font-medium text-hand">
                    <Crown className="size-3" /> Host
                  </span>
                )}
                {participant.state.screenOn && (
                  <span className="flex items-center gap-1 font-medium text-brand">
                    <MonitorUp className="size-3" /> Presenting
                  </span>
                )}
                {participant.state.handRaised && (
                  <span className="flex items-center gap-1 font-medium text-hand">
                    <Hand className="size-3 origin-bottom animate-wave" /> Hand raised
                  </span>
                )}
                {!participant.isHost && !participant.state.screenOn && !participant.state.handRaised && (
                  <span className="text-muted-foreground/70">{speaking ? "Speaking" : "Participant"}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  participant.state.micOn ? "text-muted-foreground" : "bg-destructive/12 text-destructive",
                )}
              >
                {participant.state.micOn ? (
                  <AudioBars active={speaking} className={speaking ? "text-brand" : undefined} />
                ) : (
                  <MicOff className="size-3.5" aria-label="Muted" />
                )}
              </span>

              {/* Hosts get a remove slot on every row (empty on their own) so the
                  mic indicators stay in one column. */}
              {isHost && (isSelf || participant.peerId === selfPeerId) && <span className="size-8" aria-hidden />}
              {isHost && !isSelf && participant.peerId !== selfPeerId && (
                <button
                  type="button"
                  onClick={() => onRemovePeer(participant.peerId)}
                  aria-label={`Remove ${participant.name}`}
                  title={`Remove ${participant.name}`}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <UserMinus className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

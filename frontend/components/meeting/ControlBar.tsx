"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX,
  MessageSquare, Users, Hand, PhoneOff, Settings2, Lock, Unlock,
} from "lucide-react"

interface ControlBarProps {
  micOn: boolean
  camOn: boolean
  isSharing: boolean
  handRaised: boolean
  locked: boolean
  isHost: boolean
  participantCount: number
  unreadCount: number
  activePanel: "chat" | "people" | null
  screenShareSupported: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onToggleShare: () => void
  onToggleHand: () => void
  onTogglePanel: (panel: "chat" | "people") => void
  onToggleLock: () => void
  onOpenSettings: () => void
  onLeave: () => void
}

export function ControlBar(props: ControlBarProps) {
  const [confirmLeave, setConfirmLeave] = useState(false)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5">
      <div className="glass-high lit-edge pointer-events-auto flex items-center gap-1.5 rounded-2xl p-2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] animate-rise">
        <ControlButton
          label={props.micOn ? "Mute" : "Unmute"}
          active={props.micOn}
          danger={!props.micOn}
          onClick={props.onToggleMic}
          icon={props.micOn ? <Mic /> : <MicOff />}
          shortcut="⌘D"
        />
        <ControlButton
          label={props.camOn ? "Turn off camera" : "Turn on camera"}
          active={props.camOn}
          danger={!props.camOn}
          onClick={props.onToggleCam}
          icon={props.camOn ? <Video /> : <VideoOff />}
          shortcut="⌘E"
        />

        <Divider />

        {props.screenShareSupported && (
          <ControlButton
            label={props.isSharing ? "Stop presenting" : "Present screen"}
            active={props.isSharing}
            highlight={props.isSharing}
            onClick={props.onToggleShare}
            icon={props.isSharing ? <MonitorX /> : <MonitorUp />}
          />
        )}
        <ControlButton
          label={props.handRaised ? "Lower hand" : "Raise hand"}
          active={props.handRaised}
          highlight={props.handRaised}
          onClick={props.onToggleHand}
          icon={<Hand />}
        />
        <ControlButton
          label="Chat"
          active={props.activePanel === "chat"}
          highlight={props.activePanel === "chat"}
          onClick={() => props.onTogglePanel("chat")}
          icon={<MessageSquare />}
          badge={props.unreadCount > 0 ? props.unreadCount : undefined}
        />
        <ControlButton
          label="Participants"
          active={props.activePanel === "people"}
          highlight={props.activePanel === "people"}
          onClick={() => props.onTogglePanel("people")}
          icon={<Users />}
          count={props.participantCount}
        />

        {props.isHost && (
          <ControlButton
            label={props.locked ? "Unlock meeting" : "Lock meeting"}
            active={props.locked}
            highlight={props.locked}
            onClick={props.onToggleLock}
            icon={props.locked ? <Lock /> : <Unlock />}
          />
        )}

        <ControlButton
          label="Settings"
          active={false}
          onClick={props.onOpenSettings}
          icon={<Settings2 />}
        />

        <Divider />

        {/* Leaving is irreversible mid-call, so the button asks once. */}
        <button
          type="button"
          onClick={() => (confirmLeave ? props.onLeave() : setConfirmLeave(true))}
          onBlur={() => setConfirmLeave(false)}
          className={cn(
            "flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-all duration-200 active:scale-95",
            confirmLeave ? "bg-destructive px-5" : "bg-destructive/85 hover:bg-destructive",
          )}
        >
          <PhoneOff className="size-[18px]" />
          {confirmLeave ? "Confirm" : "Leave"}
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-7 w-px bg-stroke" />
}

interface ControlButtonProps {
  label: string
  icon: React.ReactNode
  active: boolean
  danger?: boolean
  highlight?: boolean
  badge?: number
  count?: number
  shortcut?: string
  onClick: () => void
}

function ControlButton({
  label, icon, danger, highlight, badge, count, shortcut, onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "group/btn relative grid size-11 place-items-center rounded-xl transition-all duration-200 active:scale-95",
        "[&_svg]:size-[18px] [&_svg]:transition-transform [&_svg]:duration-200",
        danger
          ? "bg-destructive/90 text-white hover:bg-destructive"
          : highlight
            ? "bg-brand text-primary-foreground hover:brightness-110"
            : "bg-white/5 text-foreground/85 hover:bg-white/10 hover:text-foreground",
      )}
    >
      {icon}

      {typeof badge === "number" && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-surface-high">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      {typeof count === "number" && badge === undefined && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-white/15 px-1 text-[10px] font-semibold text-foreground ring-2 ring-surface-high">
          {count}
        </span>
      )}

      {/* Tooltip; pointer-events-none so it never blocks the button. */}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg ring-1 ring-stroke transition-opacity duration-150 group-hover/btn:opacity-100">
        {label}
      </span>
    </button>
  )
}

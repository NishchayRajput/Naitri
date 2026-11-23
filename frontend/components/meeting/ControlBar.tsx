"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, MoreHorizontal,
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

interface SecondaryAction {
  key: string
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}

export function ControlBar(props: ControlBarProps) {
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // Actions that collapse into the "More" menu on narrow screens, so the dock
  // always fits on a phone.
  const secondary: SecondaryAction[] = [
    ...(props.screenShareSupported
      ? [{
          key: "share",
          label: props.isSharing ? "Stop presenting" : "Present screen",
          icon: props.isSharing ? <MonitorX /> : <MonitorUp />,
          active: props.isSharing,
          onClick: props.onToggleShare,
        }]
      : []),
    {
      key: "hand",
      label: props.handRaised ? "Lower hand" : "Raise hand",
      icon: <Hand />,
      active: props.handRaised,
      onClick: props.onToggleHand,
    },
    ...(props.isHost
      ? [{
          key: "lock",
          label: props.locked ? "Unlock meeting" : "Lock meeting",
          icon: props.locked ? <Lock /> : <Unlock />,
          active: props.locked,
          onClick: props.onToggleLock,
        }]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: <Settings2 />,
      active: false,
      onClick: props.onOpenSettings,
    },
  ]

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-safe sm:pb-5">
      <div className="glass-high lit-edge pointer-events-auto relative flex items-center gap-1.5 rounded-full p-1.5 shadow-float animate-rise sm:gap-2 sm:p-2">
        <ControlButton
          label={props.micOn ? "Mute" : "Unmute"}
          variant={props.micOn ? "default" : "danger"}
          onClick={props.onToggleMic}
          icon={props.micOn ? <Mic /> : <MicOff />}
          shortcut="Ctrl D"
        />
        <ControlButton
          label={props.camOn ? "Turn off camera" : "Turn on camera"}
          variant={props.camOn ? "default" : "danger"}
          onClick={props.onToggleCam}
          icon={props.camOn ? <Video /> : <VideoOff />}
          shortcut="Ctrl E"
        />

        <Divider />

        {secondary.map((a) => (
          <ControlButton
            key={a.key}
            label={a.label}
            variant={a.active ? "active" : "default"}
            onClick={a.onClick}
            icon={a.icon}
            className="hidden sm:grid"
          />
        ))}

        <ControlButton
          label="Chat"
          variant={props.activePanel === "chat" ? "active" : "default"}
          onClick={() => props.onTogglePanel("chat")}
          icon={<MessageSquare />}
          badge={props.unreadCount > 0 ? props.unreadCount : undefined}
        />
        <ControlButton
          label="Participants"
          variant={props.activePanel === "people" ? "active" : "default"}
          onClick={() => props.onTogglePanel("people")}
          icon={<Users />}
          count={props.participantCount}
        />

        {/* Mobile overflow menu */}
        <div className="relative sm:hidden">
          <ControlButton
            label="More options"
            variant={moreOpen || secondary.some((a) => a.active) ? "active" : "default"}
            onClick={() => setMoreOpen((o) => !o)}
            icon={<MoreHorizontal />}
          />
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-0" onClick={() => setMoreOpen(false)} aria-hidden />
              <div
                role="menu"
                className="glass-high absolute bottom-[calc(100%+12px)] left-1/2 z-10 w-56 -translate-x-1/2 rounded-2xl p-1.5 shadow-float animate-pop"
              >
                {secondary.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      a.onClick()
                      setMoreOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors [&_svg]:size-[18px]",
                      a.active ? "bg-brand/12 text-brand" : "text-foreground hover:bg-white/6",
                    )}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <Divider />

        {/* Leaving is irreversible mid-call, so the button asks once. */}
        <button
          type="button"
          onClick={() => (confirmLeave ? props.onLeave() : setConfirmLeave(true))}
          onBlur={() => setConfirmLeave(false)}
          aria-label={confirmLeave ? "Confirm leave" : "Leave"}
          className={cn(
            "flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-white transition-all duration-200 active:scale-95 sm:h-12 sm:px-5",
            confirmLeave
              ? "bg-destructive shadow-[0_0_0_4px_oklch(0.66_0.21_22_/_25%)]"
              : "bg-destructive/90 hover:bg-destructive",
          )}
        >
          <PhoneOff className="size-[18px]" />
          <span className={cn(!confirmLeave && "hidden sm:inline")}>{confirmLeave ? "Confirm" : "Leave"}</span>
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return <span className="mx-0.5 hidden h-7 w-px bg-white/10 sm:block" />
}

interface ControlButtonProps {
  label: string
  icon: React.ReactNode
  variant: "default" | "active" | "danger"
  badge?: number
  count?: number
  shortcut?: string
  className?: string
  onClick: () => void
}

function ControlButton({
  label, icon, variant, badge, count, shortcut, className, onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={variant === "active" ? true : undefined}
      className={cn(
        "group/btn relative grid size-11 place-items-center rounded-full transition-all duration-200 active:scale-90 sm:size-12",
        "[&_svg]:size-[19px]",
        variant === "danger" && "bg-destructive text-white hover:brightness-110",
        variant === "active" && "bg-brand text-brand-ink hover:brightness-105",
        variant === "default" && "bg-white/[0.07] text-foreground/90 hover:bg-white/[0.13] hover:text-foreground",
        className,
      )}
    >
      {icon}

      {typeof badge === "number" && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink ring-2 ring-surface-high animate-pop">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      {typeof count === "number" && badge === undefined && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold ring-2 ring-surface-high",
            variant === "active" ? "bg-brand-ink text-brand" : "bg-surface-high text-foreground",
          )}
        >
          {count}
        </span>
      )}

      {/* Tooltip; pointer-events-none so it never blocks the button. */}
      <span className="pointer-events-none absolute -top-11 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-popover px-2.5 py-1.5 text-[12px] font-medium text-foreground opacity-0 shadow-lg ring-1 ring-stroke transition-all duration-150 group-hover/btn:-translate-y-0.5 group-hover/btn:opacity-100 sm:flex">
        {label}
        {shortcut && (
          <kbd className="rounded bg-white/8 px-1 font-mono text-[10px] text-muted-foreground">{shortcut}</kbd>
        )}
      </span>
    </button>
  )
}

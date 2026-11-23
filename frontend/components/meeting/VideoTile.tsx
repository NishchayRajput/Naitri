"use client"

import { memo, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { InitialsAvatar } from "@/components/shared/Avatar"
import { AudioBars } from "@/components/shared/AudioBars"
import type { Participant } from "@/types/signaling"
import { Hand, MicOff, Pin, PinOff, MonitorUp, Crown } from "lucide-react"

interface VideoTileProps {
  participant: Participant
  stream: MediaStream | null
  isSelf: boolean
  isScreen?: boolean
  pinned?: boolean
  onTogglePin?: () => void
  className?: string
  compact?: boolean
}

function VideoTileImpl({
  participant,
  stream,
  isSelf,
  isScreen = false,
  pinned = false,
  onTogglePin,
  className,
  compact = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // srcObject cannot be set declaratively, and reassigning the same stream
  // restarts playback, so it is guarded.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (el.srcObject !== stream) {
      el.srcObject = stream
    }
    if (stream) {
      // Autoplay can reject when the tab has no user gesture yet; the call is
      // retried implicitly on the next interaction, so a warning is enough.
      el.play().catch(() => {})
    }
  }, [stream])

  const { state } = participant
  const showVideo = isScreen ? Boolean(stream) : Boolean(stream) && state.camOn
  const speaking = state.speaking && state.micOn && !isScreen

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[22px] bg-surface transition-shadow duration-300",
        speaking ? "speaking-glow" : "ring-1 ring-white/[0.07]",
        className,
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Local playback of your own mic would create an echo loop.
        muted={isSelf || isScreen}
        className={cn(
          "size-full transition-opacity duration-500",
          // A screen share is letterboxed: cropping a shared document to fill
          // the tile would cut off exactly the content being presented.
          isScreen ? "bg-black object-contain" : "object-cover",
          // Self-view is mirrored to match what people expect from a mirror.
          isSelf && !isScreen && "-scale-x-100",
          showVideo ? "opacity-100" : "opacity-0",
        )}
      />

      {!showVideo && (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{
            // Each person's tile is tinted with their own account colour, so a
            // grid of cameras-off still tells people apart at a glance.
            background: `radial-gradient(85% 75% at 50% 38%, color-mix(in oklab, ${participant.avatarColor} 34%, transparent), transparent 72%), var(--surface)`,
          }}
        >
          <div className="relative flex flex-col items-center gap-3">
            <span className={cn("rounded-full", speaking && "animate-pulse-ring")}>
              <InitialsAvatar
                name={participant.name}
                color={participant.avatarColor}
                size={compact ? 48 : 92}
                className="bg-surface"
              />
            </span>
          </div>
        </div>
      )}

      {/* Bottom scrim keeps the name legible over bright video. */}
      {showVideo && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      )}

      {/* Name tag */}
      <div className={cn("absolute flex max-w-[calc(100%-1.5rem)] items-center", compact ? "bottom-2 left-2" : "bottom-3 left-3")}>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-full bg-black/50 font-medium text-white backdrop-blur-md",
            compact ? "py-0.5 pl-1.5 pr-2 text-[11px]" : "py-1 pl-2 pr-3 text-[12.5px]",
          )}
        >
          {isScreen ? (
            <MonitorUp className="size-3.5 shrink-0 text-brand" />
          ) : state.micOn ? (
            <AudioBars active={speaking} className={cn("shrink-0", speaking ? "text-brand" : "text-white/55")} />
          ) : (
            <MicOff className="size-3.5 shrink-0 text-destructive" aria-label="Muted" />
          )}
          <span className="truncate">
            {isSelf ? "You" : participant.name}
            {isScreen && <span className="text-white/60"> · presenting</span>}
          </span>
          {participant.isHost && !isScreen && (
            <Crown className="size-3 shrink-0 text-hand" aria-label="Host" />
          )}
        </span>
      </div>

      {/* Status badges, top-left. */}
      <div className={cn("absolute flex items-center gap-1.5", compact ? "left-2 top-2" : "left-3 top-3")}>
        {state.handRaised && !isScreen && (
          <span className="flex items-center gap-1 rounded-full bg-hand px-2 py-1 text-[11px] font-semibold text-black/80 shadow-lg animate-pop">
            <Hand className="size-3.5 origin-bottom animate-wave" />
            {!compact && "Hand raised"}
          </span>
        )}
      </div>

      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? "Unpin" : "Pin"}
          title={pinned ? "Unpin" : "Pin to stage"}
          className={cn(
            "absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/50 text-white/85 backdrop-blur-md transition-all duration-200 hover:bg-black/70 hover:text-white focus-visible:opacity-100 group-hover:opacity-100",
            pinned ? "opacity-100 ring-1 ring-brand/60 text-brand" : "opacity-0",
          )}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      )}
    </div>
  )
}

export const VideoTile = memo(VideoTileImpl)

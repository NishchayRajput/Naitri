"use client"

import { memo, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { InitialsAvatar } from "@/components/shared/Avatar"
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
        "group relative overflow-hidden rounded-2xl bg-black/60 transition-[box-shadow,transform] duration-300",
        "ring-1 ring-stroke",
        speaking && "ring-2 ring-live shadow-[0_0_0_4px_oklch(0.76_0.18_155_/_12%),0_0_40px_-6px_oklch(0.76_0.18_155_/_45%)]",
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
          "size-full transition-opacity duration-300",
          // A screen share is letterboxed: cropping a shared document to fill
          // the tile would cut off exactly the content being presented.
          isScreen ? "object-contain" : "object-cover",
          // Self-view is mirrored to match what people expect from a mirror.
          isSelf && !isScreen && "-scale-x-100",
          showVideo ? "opacity-100" : "opacity-0",
        )}
      />

      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.28_0.03_265),oklch(0.16_0.012_265))]" />
          <div className="relative flex flex-col items-center gap-3">
            <InitialsAvatar
              name={participant.name}
              color={participant.avatarColor}
              size={compact ? 44 : 76}
            />
            {!compact && (
              <span className="text-xs font-medium text-muted-foreground">Camera off</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom scrim keeps the name legible over bright video. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2.5">
        <span
          className={cn(
            "truncate font-medium text-white drop-shadow-sm",
            compact ? "text-[11px]" : "text-[13px]",
          )}
        >
          {isSelf ? "You" : participant.name}
          {isScreen && <span className="text-white/60"> · screen</span>}
        </span>

        {participant.isHost && !isScreen && (
          <Crown className="size-3 shrink-0 text-amber-300/90" aria-label="Host" />
        )}

        <span className="flex-1" />

        {!isScreen && !state.micOn && (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-destructive/90">
            <MicOff className="size-3 text-white" aria-label="Muted" />
          </span>
        )}
      </div>

      {/* Status badges, top-left. */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        {state.handRaised && !isScreen && (
          <span className="flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1 text-[10px] font-semibold text-amber-950 animate-pop">
            <Hand className="size-3" />
            Raised
          </span>
        )}
        {isScreen && (
          <span className="flex items-center gap-1 rounded-full bg-brand/90 px-2 py-1 text-[10px] font-semibold text-white">
            <MonitorUp className="size-3" />
            Presenting
          </span>
        )}
      </div>

      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? "Unpin" : "Pin"}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/55 text-white/80 opacity-0 backdrop-blur transition-all duration-200 hover:bg-black/75 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      )}
    </div>
  )
}

export const VideoTile = memo(VideoTileImpl)

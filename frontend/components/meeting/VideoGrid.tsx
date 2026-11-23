"use client"

import { useGridLayout } from "@/hooks/useGridLayout"
import { VideoTile } from "./VideoTile"
import type { PeerMedia } from "@/hooks/useMeeting"
import type { Participant } from "@/types/signaling"

export interface RosterEntry {
  participant: Participant
  media: PeerMedia
  isSelf: boolean
}

interface VideoGridProps {
  roster: RosterEntry[]
  pinnedPeerId: string | null
  onTogglePin: (peerId: string) => void
}

export function VideoGrid({ roster, pinnedPeerId, onTogglePin }: VideoGridProps) {
  const { ref, layout } = useGridLayout(roster.length)

  return (
    <div ref={ref} className="flex size-full items-center justify-center">
      <div
        className="grid content-center justify-center gap-3"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, ${layout.tileWidth}px)`,
          gridAutoRows: `${layout.tileHeight}px`,
        }}
      >
        {roster.map((entry) => (
          <VideoTile
            key={entry.participant.peerId}
            participant={entry.participant}
            stream={entry.media.camera}
            isSelf={entry.isSelf}
            pinned={pinnedPeerId === entry.participant.peerId}
            onTogglePin={roster.length > 1 ? () => onTogglePin(entry.participant.peerId) : undefined}
            compact={layout.tileWidth < 220}
            className="animate-pop"
          />
        ))}
      </div>
    </div>
  )
}

interface StageLayoutProps {
  /** The tile that owns the stage: a screen share or a pinned participant. */
  stage: { entry: RosterEntry; isScreen: boolean }
  others: RosterEntry[]
  onTogglePin: (peerId: string) => void
  pinnedPeerId: string | null
}

/**
 * Stage layout: one large tile plus a filmstrip. Used whenever someone is
 * presenting or a participant is pinned, because an equal grid makes shared
 * content unreadable.
 */
export function StageLayout({ stage, others, onTogglePin, pinnedPeerId }: StageLayoutProps) {
  return (
    <div className="flex size-full flex-col gap-3.5 lg:flex-row">
      <div className="min-h-0 flex-1">
        <VideoTile
          participant={stage.entry.participant}
          stream={stage.isScreen ? stage.entry.media.screen : stage.entry.media.camera}
          isSelf={stage.entry.isSelf}
          isScreen={stage.isScreen}
          pinned={pinnedPeerId === stage.entry.participant.peerId}
          onTogglePin={
            stage.isScreen ? undefined : () => onTogglePin(stage.entry.participant.peerId)
          }
          className="size-full"
        />
      </div>

      {others.length > 0 && (
        <div className="no-scrollbar flex shrink-0 gap-3 overflow-x-auto lg:w-60 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          {others.map((entry) => (
            <VideoTile
              key={entry.participant.peerId}
              participant={entry.participant}
              stream={entry.media.camera}
              isSelf={entry.isSelf}
              compact
              pinned={pinnedPeerId === entry.participant.peerId}
              onTogglePin={() => onTogglePin(entry.participant.peerId)}
              className="aspect-video h-24 shrink-0 lg:h-auto lg:w-full"
            />
          ))}
        </div>
      )}
    </div>
  )
}

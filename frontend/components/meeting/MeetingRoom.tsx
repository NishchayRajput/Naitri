"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMeeting } from "@/hooks/useMeeting"
import type { DevicePreferences } from "@/lib/devices"
import { MeetingHeader } from "./MeetingHeader"
import { ControlBar } from "./ControlBar"
import { SidePanel } from "./SidePanel"
import { SettingsSheet } from "./SettingsSheet"
import { AudioSink } from "./AudioSink"
import { StageLayout, VideoGrid, type RosterEntry } from "./VideoGrid"
import { MeetingEnded } from "./MeetingEnded"

interface MeetingRoomProps {
  roomCode: string
  initialStream: MediaStream
  initialMicOn: boolean
  initialCamOn: boolean
  devicePrefs: DevicePreferences
  fallbackRoomName: string
}

export function MeetingRoom({
  roomCode, initialStream, initialMicOn, initialCamOn, devicePrefs, fallbackRoomName,
}: MeetingRoomProps) {
  const router = useRouter()
  const [panel, setPanel] = useState<"chat" | "people" | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [ended, setEnded] = useState<{ title: string; detail: string } | null>(null)
  const joinedAt = useRef(Date.now())

  const handleFatal = useCallback((err: { code: string; message: string }) => {
    setEnded({
      title:
        err.code === "removed_by_host"
          ? "You were removed"
          : err.code === "room_full"
            ? "This meeting is full"
            : "Meeting ended",
      detail: err.message,
    })
  }, [])

  const meeting = useMeeting({
    roomCode,
    initialStream,
    initialMicOn,
    initialCamOn,
    devicePrefs,
    onFatal: handleFatal,
  })

  const { actions, roster, activeShare, messages, self, room, status } = meeting

  // Track unread chat while the panel is closed.
  const seenCount = useRef(0)
  useEffect(() => {
    if (panel === "chat") {
      seenCount.current = messages.length
      setUnread(0)
    } else {
      setUnread(messages.length - seenCount.current)
    }
  }, [messages.length, panel])

  const leave = useCallback(() => {
    actions.leave()
    router.push("/")
  }, [actions, router])

  // Keyboard shortcuts, matching the conventions people already know from
  // Meet and Zoom. Suppressed while typing so chat is not hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return

      const key = e.key.toLowerCase()
      if (key === "d") {
        e.preventDefault()
        actions.toggleMic()
      } else if (key === "e") {
        e.preventDefault()
        actions.toggleCam()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [actions])

  const togglePin = useCallback((peerId: string) => {
    setPinnedPeerId((prev) => (prev === peerId ? null : peerId))
  }, [])

  const toggleShare = useCallback(() => {
    if (meeting.isSharing) actions.stopScreenShare()
    else void actions.startScreenShare().catch(() => {})
  }, [meeting.isSharing, actions])

  // A screen share always takes the stage; otherwise an explicit pin does.
  const stage = useMemo((): { entry: RosterEntry; isScreen: boolean } | null => {
    if (activeShare) return { entry: activeShare, isScreen: true }
    if (pinnedPeerId) {
      const pinned = roster.find((e) => e.participant.peerId === pinnedPeerId)
      if (pinned) return { entry: pinned, isScreen: false }
    }
    return null
  }, [activeShare, pinnedPeerId, roster])

  const filmstrip = useMemo(() => {
    if (!stage) return []
    // When someone presents, they still appear in the filmstrip as a camera
    // tile — people want to see the presenter's face alongside their slides.
    return stage.isScreen
      ? roster
      : roster.filter((e) => e.participant.peerId !== stage.entry.participant.peerId)
  }, [stage, roster])

  const screenShareSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)

  if (ended) {
    return <MeetingEnded title={ended.title} detail={ended.detail} roomCode={roomCode} />
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas">
      <MeetingHeader
        roomName={room?.name ?? fallbackRoomName}
        roomCode={roomCode}
        locked={room?.locked ?? false}
        status={status}
        joinedAt={joinedAt.current}
      />

      <main className="flex min-h-0 flex-1 gap-3 px-3 pb-24">
        <div className="min-w-0 flex-1">
          {roster.length === 0 ? (
            <div className="grid size-full place-items-center text-sm text-muted-foreground">
              Connecting to the meeting…
            </div>
          ) : stage ? (
            <StageLayout
              stage={stage}
              others={filmstrip}
              onTogglePin={togglePin}
              pinnedPeerId={pinnedPeerId}
            />
          ) : (
            <VideoGrid roster={roster} pinnedPeerId={pinnedPeerId} onTogglePin={togglePin} />
          )}
        </div>

        {panel && (
          <div className="absolute inset-0 z-40 bg-canvas/95 p-3 lg:static lg:z-auto lg:w-[340px] lg:shrink-0 lg:bg-transparent lg:p-0">
            <SidePanel
              panel={panel}
              onSwitch={setPanel}
              onClose={() => setPanel(null)}
              messages={messages}
              roster={roster}
              selfPeerId={self?.peerId ?? null}
              isHost={self?.isHost ?? false}
              onSend={actions.sendChat}
              onRemovePeer={actions.removePeer}
            />
          </div>
        )}
      </main>

      {/* Audio playback is kept outside the tile tree so layout changes never
          interrupt someone mid-sentence. */}
      {roster
        .filter((e) => !e.isSelf && e.media.audio)
        .map((e) => (
          <AudioSink
            key={e.participant.peerId}
            peerId={e.participant.peerId}
            stream={e.media.audio!}
          />
        ))}

      <ControlBar
        micOn={meeting.micOn}
        camOn={meeting.camOn}
        isSharing={meeting.isSharing}
        handRaised={meeting.handRaised}
        locked={room?.locked ?? false}
        isHost={self?.isHost ?? false}
        participantCount={roster.length}
        unreadCount={unread}
        activePanel={panel}
        screenShareSupported={screenShareSupported}
        onToggleMic={actions.toggleMic}
        onToggleCam={actions.toggleCam}
        onToggleShare={toggleShare}
        onToggleHand={actions.toggleHand}
        onTogglePanel={(p) => setPanel((prev) => (prev === p ? null : p))}
        onToggleLock={() => actions.setLocked(!(room?.locked ?? false))}
        onOpenSettings={() => setSettingsOpen(true)}
        onLeave={leave}
      />

      <SettingsSheet
        open={settingsOpen}
        prefs={devicePrefs}
        onClose={() => setSettingsOpen(false)}
        onSwitchDevice={actions.switchDevice}
      />
    </div>
  )
}

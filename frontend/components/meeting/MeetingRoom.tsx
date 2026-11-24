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
import { Whiteboard, type BoardPeer } from "./Whiteboard"
import { Check, Link2 } from "lucide-react"

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

  // Names and colours for whiteboard cursors.
  const boardPeers = useMemo(() => {
    const m = new Map<string, BoardPeer>()
    for (const e of roster) {
      m.set(e.participant.peerId, { name: e.participant.name, color: e.participant.avatarColor })
    }
    return m
  }, [roster])

  // "Board full" is the one whiteboard error worth surfacing; show it briefly.
  const [boardNotice, setBoardNotice] = useState<string | null>(null)
  useEffect(() => {
    if (meeting.error?.code !== "board_full") return
    setBoardNotice(meeting.error.message)
    const id = setTimeout(() => setBoardNotice(null), 4000)
    return () => clearTimeout(id)
  }, [meeting.error])

  const screenShareSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)

  if (ended) {
    return <MeetingEnded title={ended.title} detail={ended.detail} roomCode={roomCode} />
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas">
      {/* Faint lime wash at the top so the room is not a flat black box. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_55%_100%_at_50%_0%,oklch(0.9_0.19_125_/_7%),transparent)]" />

      <MeetingHeader
        roomName={room?.name ?? fallbackRoomName}
        roomCode={roomCode}
        locked={room?.locked ?? false}
        status={status}
        joinedAt={joinedAt.current}
      />

      <main className="relative flex min-h-0 flex-1 gap-3 px-3 pb-24 sm:px-4 sm:pb-28">
        <div className="relative min-w-0 flex-1">
          {roster.length === 1 && roster[0].isSelf && !meeting.boardOpen && <InviteCard roomCode={roomCode} />}
          {roster.length === 0 ? (
            <div className="grid size-full place-items-center">
              <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <span className="relative grid size-14 place-items-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  <span className="size-3 rounded-full bg-brand" />
                </span>
                <span className="text-[14px]">Connecting to the meeting…</span>
              </div>
            </div>
          ) : meeting.boardOpen ? (
            // The whiteboard takes the stage for everyone; people stay visible
            // in the filmstrip.
            <StageLayout
              content={
                <Whiteboard
                  store={meeting.board}
                  peers={boardPeers}
                  roomCode={roomCode}
                  notice={boardNotice}
                  onClose={() => actions.setBoardVisible(false)}
                />
              }
              others={roster}
              onTogglePin={togglePin}
              pinnedPeerId={pinnedPeerId}
            />
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
          <div className="absolute inset-0 z-40 bg-canvas/95 p-3 pb-24 lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:bg-transparent lg:p-0">
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
        boardOpen={meeting.boardOpen}
        isHost={self?.isHost ?? false}
        participantCount={roster.length}
        unreadCount={unread}
        activePanel={panel}
        screenShareSupported={screenShareSupported}
        onToggleMic={actions.toggleMic}
        onToggleCam={actions.toggleCam}
        onToggleShare={toggleShare}
        onToggleHand={actions.toggleHand}
        onToggleBoard={() => actions.setBoardVisible(!meeting.boardOpen)}
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

/** Shown while you are alone, so the obvious next step is one click away. */
function InviteCard({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked by permissions policy; the code is shown.
    }
  }

  return (
    <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-3 animate-rise">
      <div className="glass-high flex w-full max-w-md items-center gap-3 rounded-2xl p-2.5 pl-4 shadow-float">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">You&apos;re the first one here</p>
          <p className="truncate text-[12px] text-muted-foreground">
            Share the link: <span className="font-mono">{roomCode}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-brand-ink transition-all hover:brightness-105 active:scale-95"
        >
          {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
}

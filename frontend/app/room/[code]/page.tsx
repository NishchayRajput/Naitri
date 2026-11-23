"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { api, ApiError, type RoomResolution } from "@/lib/api"
import { Lobby, type LobbyResult } from "@/components/meeting/Lobby"
import { MeetingRoom } from "@/components/meeting/MeetingRoom"
import { MeetingEnded } from "@/components/meeting/MeetingEnded"
import { AuthPanel } from "@/components/auth/AuthPanel"
import { Wordmark } from "@/components/shared/Logo"

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params.code)
  const { user, isLoading: authLoading } = useAuth()

  const [resolution, setResolution] = useState<RoomResolution | null>(null)
  const [resolveError, setResolveError] = useState<{ title: string; detail: string } | null>(null)
  const [joined, setJoined] = useState<LobbyResult | null>(null)

  // Resolve the meeting before showing the lobby, so a bad code fails with a
  // clear message instead of an opaque socket error after device setup.
  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false
    setResolveError(null)

    void (async () => {
      try {
        const result = await api.getRoom(code)
        if (!cancelled) setResolution(result)
      } catch (err) {
        if (cancelled) return
        const apiErr = err instanceof ApiError ? err : null
        setResolveError({
          title:
            apiErr?.code === "removed_from_room"
              ? "You were removed from this meeting"
              : apiErr?.code === "room_locked"
              ? "This meeting is locked"
              : apiErr?.code === "room_ended"
                ? "This meeting has ended"
                  : "Meeting not found",
          detail:
            apiErr?.message ??
            "We couldn't reach the server. Check your connection and try again.",
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, user, authLoading])

  if (authLoading) {
    return <FullScreenSpinner />
  }

  // Signing in from here keeps the user on the invite link rather than
  // bouncing them to the home page and losing the code.
  if (!user) {
    return (
      <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-5 py-10 grain">
        <div className="ambient" />
        <div className="relative z-10 w-full max-w-md animate-rise">
          <div className="mb-8 text-center">
            <div className="mb-8 flex justify-center">
              <Wordmark />
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/4 px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              <span className="size-1.5 animate-blink rounded-full bg-brand" />
              You&apos;ve been invited
            </span>
            <h1 className="mt-4 text-[30px] font-semibold tracking-tight text-foreground">
              Sign in to join
            </h1>
            <p className="mt-2 font-mono text-[14px] tracking-wide text-muted-foreground">{code}</p>
          </div>
          <AuthPanel />
        </div>
      </div>
    )
  }

  if (resolveError) {
    return <MeetingEnded title={resolveError.title} detail={resolveError.detail} roomCode={code} />
  }

  if (!resolution) {
    return <FullScreenSpinner />
  }

  if (joined) {
    return (
      <MeetingRoom
        roomCode={resolution.room.code}
        initialStream={joined.stream}
        initialMicOn={joined.micOn}
        initialCamOn={joined.camOn}
        devicePrefs={joined.prefs}
        fallbackRoomName={resolution.room.name}
      />
    )
  }

  return (
    <Lobby
      roomName={resolution.room.name}
      roomCode={resolution.room.code}
      hostName={resolution.room.hostName}
      occupancy={resolution.occupancy}
      userName={user.name}
      userColor={user.avatarColor}
      onJoin={setJoined}
    />
  )
}

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <span className="relative grid size-14 place-items-center" role="status" aria-label="Loading">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="size-3 rounded-full bg-brand" />
      </span>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { signalingUrl, api } from "@/lib/api"
import { AudioLevelMonitor } from "@/lib/audio"
import { getDisplayMedia, getUserMedia, type DevicePreferences } from "@/lib/devices"
import { RtcTransport, type RemoteTrackEvent } from "@/lib/rtc"
import { SignalingClient, type SignalingStatus } from "@/lib/signaling"
import { BoardStore } from "@/lib/whiteboard"
import type {
  ChatMessage,
  Participant,
  PeerState,
  RoomInfo,
  ServerMessage,
  TrackSource,
} from "@/types/signaling"

/** Remote media for one peer, split by purpose. */
export interface PeerMedia {
  camera: MediaStream | null
  screen: MediaStream | null
  audio: MediaStream | null
}

export interface MeetingError {
  code: string
  message: string
  fatal: boolean
}

export interface UseMeetingOptions {
  roomCode: string
  /** Stream captured in the lobby, reused so the user is not prompted twice. */
  initialStream: MediaStream | null
  initialMicOn: boolean
  initialCamOn: boolean
  devicePrefs: DevicePreferences
  onFatal?: (error: MeetingError) => void
}

const emptyMedia = (): PeerMedia => ({ camera: null, screen: null, audio: null })

export function useMeeting(opts: UseMeetingOptions) {
  const { roomCode, initialStream, initialMicOn, initialCamOn } = opts

  const [status, setStatus] = useState<SignalingStatus>("connecting")
  const [self, setSelf] = useState<Participant | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map())
  const [media, setMedia] = useState<Map<string, PeerMedia>>(new Map())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<MeetingError | null>(null)

  const [localStream, setLocalStream] = useState<MediaStream | null>(initialStream)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)

  const [micOn, setMicOn] = useState(initialMicOn)
  const [camOn, setCamOn] = useState(initialCamOn)
  const [handRaised, setHandRaised] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)

  // Refs hold everything the socket callbacks touch, so those callbacks never
  // close over stale React state.
  const signalingRef = useRef<SignalingClient | null>(null)
  const transportRef = useRef<RtcTransport | null>(null)
  const localStreamRef = useRef<MediaStream | null>(initialStream)
  const screenStreamRef = useRef<MediaStream | null>(null)

  const micSenderRef = useRef<RTCRtpSender | null>(null)
  const camSenderRef = useRef<RTCRtpSender | null>(null)
  const screenSenderRef = useRef<RTCRtpSender | null>(null)
  const screenAudioSenderRef = useRef<RTCRtpSender | null>(null)

  const stateRef = useRef<PeerState>({
    micOn: initialMicOn,
    camOn: initialCamOn,
    screenOn: false,
    handRaised: false,
    speaking: false,
  })

  // The whiteboard store lives for the whole meeting; it sends through
  // whichever socket is current, so reconnects need no re-wiring.
  const boardRef = useRef<BoardStore | null>(null)
  if (boardRef.current === null) {
    boardRef.current = new BoardStore((m) => signalingRef.current?.send(m))
  }
  const board = boardRef.current

  const onFatalRef = useRef(opts.onFatal)
  onFatalRef.current = opts.onFatal

  // ---------------------------------------------------------------- presence

  const publishState = useCallback((patch: Partial<PeerState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    signalingRef.current?.send({ type: "state", payload: stateRef.current })

    // Mirror onto our own participant entry so the local tile reacts without
    // waiting for a server round trip.
    setSelf((prev) => (prev ? { ...prev, state: stateRef.current } : prev))
  }, [])

  // ------------------------------------------------------------ remote media

  const applyRemoteTrack = useCallback((event: RemoteTrackEvent) => {
    const { peerId, source, track, stream } = event

    setMedia((prev) => {
      const next = new Map(prev)
      const entry = { ...(next.get(peerId) ?? emptyMedia()) }

      if (source === "camera") {
        entry.camera = stream
      } else if (source === "screen") {
        entry.screen = stream
      } else {
        // Microphone and screen audio share one playback element per peer.
        const audio = entry.audio ?? new MediaStream()
        if (!audio.getTrackById(track.id)) audio.addTrack(track)
        entry.audio = audio
      }

      next.set(peerId, entry)
      return next
    })
  }, [])

  const clearRemoteTrack = useCallback((peerId: string, source: TrackSource) => {
    setMedia((prev) => {
      const entry = prev.get(peerId)
      if (!entry) return prev

      const next = new Map(prev)
      const updated = { ...entry }

      if (source === "camera") updated.camera = null
      else if (source === "screen") updated.screen = null
      else updated.audio = null

      if (!updated.camera && !updated.screen && !updated.audio) next.delete(peerId)
      else next.set(peerId, updated)

      return next
    })
  }, [])

  // ------------------------------------------------------------- publishing

  /**
   * Attaches the current local tracks to the transport. Publishes when there
   * is no sender yet and replaces in place when there is, so re-acquiring the
   * camera does not force a renegotiation or make the user blink out.
   */
  const syncLocalTracks = useCallback(async () => {
    const transport = transportRef.current
    const stream = localStreamRef.current
    if (!transport || !stream) return

    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]

    if (audioTrack) {
      audioTrack.enabled = stateRef.current.micOn
      if (micSenderRef.current) {
        await transport.replaceTrack(micSenderRef.current, audioTrack, "microphone")
      } else {
        micSenderRef.current = await transport.publish(audioTrack, stream, "microphone")
      }
    }

    if (videoTrack) {
      videoTrack.enabled = stateRef.current.camOn
      if (camSenderRef.current) {
        await transport.replaceTrack(camSenderRef.current, videoTrack, "camera")
      } else {
        camSenderRef.current = await transport.publish(videoTrack, stream, "camera")
      }
    }

    // Re-publish an in-progress screen share after a reconnect.
    const screen = screenStreamRef.current
    if (screen) {
      const screenVideo = screen.getVideoTracks()[0]
      if (screenVideo && !screenSenderRef.current) {
        screenSenderRef.current = await transport.publish(screenVideo, screen, "screen")
      }
      const screenAudio = screen.getAudioTracks()[0]
      if (screenAudio && !screenAudioSenderRef.current) {
        screenAudioSenderRef.current = await transport.publish(screenAudio, screen, "screen-audio")
      }
    }
  }, [])

  // --------------------------------------------------------- message routing

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      const transport = transportRef.current

      switch (msg.type) {
        case "welcome": {
          const { self: me, room: info, participants: others, iceServers, tracks } = msg.payload

          setSelf(me)
          setRoom(info)
          setParticipants(new Map(others.map((p) => [p.peerId, p])))
          board.setSelf(me.peerId)
          board.reset(msg.payload.board)
          setBoardOpen(Boolean(msg.payload.board?.open))
          // Tracks already live in the room arrive via ontrack; this list is
          // only used to pre-size the grid so tiles do not pop in late.
          void tracks

          transportRef.current?.close()
          const next = new RtcTransport({
            iceServers,
            send: (m) => signalingRef.current?.send(m),
            onRemoteTrack: applyRemoteTrack,
            onRemoteTrackEnded: clearRemoteTrack,
            onConnectionStateChange: (target, state) => {
              if (state === "failed") {
                console.warn(`[meeting] ${target} transport failed`)
              }
            },
          })
          transportRef.current = next

          void syncLocalTracks().then(() => publishState({}))
          break
        }

        case "publisher-answer":
          void transport?.handlePublisherAnswer(msg.payload.sdp)
          break

        case "subscriber-offer":
          void transport?.handleSubscriberOffer(msg.payload.sdp)
          break

        case "trickle":
          void transport?.handleTrickle(msg.payload.target, msg.payload.candidate)
          break

        case "peer-joined":
          setParticipants((prev) => new Map(prev).set(msg.payload.peerId, msg.payload))
          break

        case "peer-left": {
          const { peerId } = msg.payload
          board.removePeer(peerId)
          setParticipants((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
          setMedia((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
          break
        }

        case "peer-state":
          setParticipants((prev) => {
            const existing = prev.get(msg.payload.peerId)
            if (!existing) return prev
            return new Map(prev).set(msg.payload.peerId, {
              ...existing,
              state: msg.payload.state,
            })
          })
          break

        case "track-unpublished":
          clearRemoteTrack(msg.payload.peerId, msg.payload.source)
          break

        case "track-published":
          // The media itself arrives through ontrack; nothing to do here.
          break

        case "chat":
          setMessages((prev) => [...prev, msg.payload])
          break

        case "room-locked":
          setRoom((prev) => (prev ? { ...prev, locked: msg.payload.locked } : prev))
          break

        case "removed":
        case "error": {
          const payload = msg.payload
          const err = { code: payload.code, message: payload.message, fatal: payload.fatal }
          setError(err)
          if (payload.fatal) onFatalRef.current?.(err)
          break
        }

        case "board-state":
          setBoardOpen(msg.payload.open)
          break

        case "board-stroke":
          board.applyChunk(msg.payload)
          break

        case "board-erase":
          board.applyErase(msg.payload.ids)
          break

        case "board-clear":
          board.applyClear()
          break

        case "board-cursor":
          board.applyCursor(msg.payload)
          break

        case "pong":
          break
      }
    },
    [applyRemoteTrack, clearRemoteTrack, syncLocalTracks, publishState, board],
  )

  // ------------------------------------------------------------- connection

  useEffect(() => {
    let disposed = false

    const client = new SignalingClient({
      resolveUrl: async () => {
        const token = await api.socketToken()
        return token ? signalingUrl(roomCode, token) : null
      },
      onMessage: (msg) => {
        if (!disposed) handleMessage(msg)
      },
      onStatus: (s) => {
        if (!disposed) setStatus(s)
      },
      onReconnected: () => {
        // The server creates a brand-new peer session per socket, so the old
        // transport and every sender reference are dead. Reset rather than
        // trying to reuse them; `welcome` rebuilds everything.
        transportRef.current?.close()
        transportRef.current = null
        micSenderRef.current = null
        camSenderRef.current = null
        screenSenderRef.current = null
        screenAudioSenderRef.current = null
        if (!disposed) {
          setParticipants(new Map())
          setMedia(new Map())
        }
      },
      onFatal: (code, message) => {
        const err = { code, message, fatal: true }
        if (!disposed) setError(err)
        onFatalRef.current?.(err)
      },
    })

    signalingRef.current = client
    void client.connect()

    return () => {
      disposed = true
      client.close()
      transportRef.current?.close()
      transportRef.current = null
      signalingRef.current = null
    }
  }, [roomCode, handleMessage])

  // Keep a live local stream.
  //
  // The unmount cleanup below stops the capture tracks, which is correct when
  // the user really navigates away. React StrictMode, however, mounts ->
  // unmounts -> remounts in development, so that cleanup also kills the stream
  // handed over from the lobby. Rather than trying to detect a "fake" unmount,
  // this effect heals a dead stream by re-acquiring it. Permission is already
  // granted at this point, so there is no second prompt. It also covers the
  // real-world case of the OS or another app seizing the camera.
  useEffect(() => {
    let cancelled = false

    const ensureLiveStream = async () => {
      const existing = localStreamRef.current
      const alive = existing?.getTracks().some((t) => t.readyState === "live")
      if (alive) return

      try {
        const fresh = await getUserMedia(opts.devicePrefs)
        if (cancelled) {
          fresh.getTracks().forEach((t) => t.stop())
          return
        }
        fresh.getAudioTracks().forEach((t) => (t.enabled = stateRef.current.micOn))
        fresh.getVideoTracks().forEach((t) => (t.enabled = stateRef.current.camOn))

        localStreamRef.current = fresh
        setLocalStream(fresh)
        // The transport may already exist (welcome can land first), so push
        // the new tracks onto it.
        await syncLocalTracks()
      } catch (err) {
        console.error("[meeting] could not acquire local media", err)
      }
    }

    void ensureLiveStream()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLocalTracks])

  // Release capture devices when the meeting is genuinely torn down.
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // -------------------------------------------------- local speaking detection

  useEffect(() => {
    if (!localStream) return

    const monitor = new AudioLevelMonitor(
      () => {},
      (isSpeaking) => {
        // Reporting "speaking" while muted would light up a tile for someone
        // nobody can hear.
        const value = isSpeaking && stateRef.current.micOn
        setSpeaking(value)
        publishState({ speaking: value })
      },
    )
    monitor.start(localStream)

    return () => monitor.stop()
  }, [localStream, publishState])

  // ------------------------------------------------------------------ actions

  const toggleMic = useCallback(() => {
    const next = !stateRef.current.micOn
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next))
    setMicOn(next)
    if (!next) setSpeaking(false)
    publishState({ micOn: next, speaking: next ? stateRef.current.speaking : false })
  }, [publishState])

  const toggleCam = useCallback(() => {
    const next = !stateRef.current.camOn
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next))
    setCamOn(next)
    publishState({ camOn: next })
  }, [publishState])

  const toggleHand = useCallback(() => {
    const next = !stateRef.current.handRaised
    setHandRaised(next)
    publishState({ handRaised: next })
  }, [publishState])

  const stopScreenShare = useCallback(() => {
    const transport = transportRef.current
    const stream = screenStreamRef.current

    if (transport) {
      if (screenSenderRef.current) transport.unpublish(screenSenderRef.current)
      if (screenAudioSenderRef.current) transport.unpublish(screenAudioSenderRef.current)
    }
    screenSenderRef.current = null
    screenAudioSenderRef.current = null

    stream?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    setScreenStream(null)
    publishState({ screenOn: false })
  }, [publishState])

  const startScreenShare = useCallback(async () => {
    const transport = transportRef.current
    if (!transport) return

    const stream = await getDisplayMedia()
    screenStreamRef.current = stream
    setScreenStream(stream)

    const video = stream.getVideoTracks()[0]
    if (video) {
      // Fires when the user stops sharing from the browser's own bar, which is
      // the most common way people end a share.
      video.addEventListener("ended", () => stopScreenShare(), { once: true })
      screenSenderRef.current = await transport.publish(video, stream, "screen")
    }

    const audio = stream.getAudioTracks()[0]
    if (audio) {
      screenAudioSenderRef.current = await transport.publish(audio, stream, "screen-audio")
    }

    publishState({ screenOn: true })
  }, [publishState, stopScreenShare])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    signalingRef.current?.send({ type: "chat", payload: { text: trimmed } })
  }, [])

  const setLocked = useCallback((locked: boolean) => {
    signalingRef.current?.send({ type: "lock", payload: { locked } })
  }, [])

  /** Opens or closes the whiteboard for everyone in the room. */
  const setBoardVisible = useCallback((open: boolean) => {
    setBoardOpen(open)
    signalingRef.current?.send({ type: "board-open", payload: { open } })
  }, [])

  const removePeer = useCallback((peerId: string) => {
    signalingRef.current?.send({ type: "remove-peer", payload: { peerId } })
  }, [])

  /** Swaps camera or microphone mid-call without renegotiating. */
  const switchDevice = useCallback(
    async (kind: "audioinput" | "videoinput", deviceId: string) => {
      const transport = transportRef.current
      const stream = localStreamRef.current
      if (!stream) return

      const constraints: MediaStreamConstraints =
        kind === "audioinput"
          ? { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } }
          : { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }

      const replacement = await navigator.mediaDevices.getUserMedia(constraints)
      const newTrack =
        kind === "audioinput" ? replacement.getAudioTracks()[0] : replacement.getVideoTracks()[0]
      if (!newTrack) return

      const oldTracks = kind === "audioinput" ? stream.getAudioTracks() : stream.getVideoTracks()
      oldTracks.forEach((t) => {
        stream.removeTrack(t)
        t.stop()
      })

      newTrack.enabled = kind === "audioinput" ? stateRef.current.micOn : stateRef.current.camOn
      stream.addTrack(newTrack)

      const sender = kind === "audioinput" ? micSenderRef.current : camSenderRef.current
      if (sender && transport) {
        await transport.replaceTrack(sender, newTrack, kind === "audioinput" ? "microphone" : "camera")
      }

      // Force a re-render so the local preview picks up the new track.
      setLocalStream(new MediaStream(stream.getTracks()))
      localStreamRef.current = stream
    },
    [],
  )

  // The store owns timers (stroke flushing, cursor throttling).
  useEffect(() => () => board.dispose(), [board])

  const leave = useCallback(() => {
    signalingRef.current?.close()
    transportRef.current?.close()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // ------------------------------------------------------------- derived view

  /** Everyone in the room, self first, each paired with their media. */
  const roster = useMemo(() => {
    const list: Array<{ participant: Participant; media: PeerMedia; isSelf: boolean }> = []

    if (self) {
      list.push({
        participant: { ...self, state: { ...self.state, speaking } },
        media: { camera: localStream, screen: screenStream, audio: null },
        isSelf: true,
      })
    }
    for (const p of participants.values()) {
      list.push({ participant: p, media: media.get(p.peerId) ?? emptyMedia(), isSelf: false })
    }
    return list
  }, [self, participants, media, localStream, screenStream, speaking])

  /** The screen share that should take the stage, if any. */
  const activeShare = useMemo(() => {
    for (const entry of roster) {
      if (entry.media.screen) return entry
    }
    return null
  }, [roster])

  return {
    status,
    self,
    room,
    roster,
    activeShare,
    messages,
    error,
    localStream,
    screenStream,
    micOn,
    camOn,
    handRaised,
    speaking,
    isSharing: screenStream !== null,
    board,
    boardOpen,
    actions: {
      toggleMic,
      toggleCam,
      toggleHand,
      startScreenShare,
      stopScreenShare,
      sendChat,
      setLocked,
      removePeer,
      setBoardVisible,
      switchDevice,
      leave,
    },
  }
}

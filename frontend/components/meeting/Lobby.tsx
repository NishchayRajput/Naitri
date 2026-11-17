"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { AudioLevelMonitor } from "@/lib/audio"
import {
  listDevices, loadDevicePreferences, saveDevicePreferences,
  getUserMedia, MediaPermissionError,
  type DeviceOption, type DevicePreferences,
} from "@/lib/devices"
import { InitialsAvatar } from "@/components/shared/Avatar"
import { DeviceSelect, LevelMeter } from "./DeviceSelect"
import { Wordmark } from "@/components/shared/Logo"
import {
  AlertCircle, Camera, Mic, MicOff, Video, VideoOff, Loader2, Users,
} from "lucide-react"

export interface LobbyResult {
  stream: MediaStream
  micOn: boolean
  camOn: boolean
  prefs: DevicePreferences
}

interface LobbyProps {
  roomName: string
  roomCode: string
  hostName: string
  occupancy: number
  userName: string
  userColor: string
  onJoin: (result: LobbyResult) => void
}

/**
 * Pre-join screen. Capturing and previewing media here means permission
 * prompts, a dead camera or the wrong microphone surface before the user is
 * live in front of other people.
 */
export function Lobby({
  roomName, roomCode, hostName, occupancy, userName, userColor, onJoin,
}: LobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const monitorRef = useRef<AudioLevelMonitor | null>(null)
  // The joined stream is handed to the meeting, so cleanup must not stop it.
  const handedOffRef = useRef(false)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [prefs, setPrefs] = useState<DevicePreferences>({})
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const saved = loadDevicePreferences()
      try {
        const captured = await getUserMedia(saved)
        if (cancelled) {
          captured.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = captured
        setStream(captured)

        // Labels are only populated after permission is granted, so devices
        // are enumerated after capture rather than before.
        const list = await listDevices()
        if (cancelled) return

        setDevices(list)
        setPrefs({
          audioInput: saved.audioInput ?? captured.getAudioTracks()[0]?.getSettings().deviceId,
          videoInput: saved.videoInput ?? captured.getVideoTracks()[0]?.getSettings().deviceId,
        })
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof MediaPermissionError
            ? err.message
            : "Could not access your camera or microphone.",
        )
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()

    return () => {
      cancelled = true
      monitorRef.current?.stop()
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (el && el.srcObject !== stream) el.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (!stream) return
    const monitor = new AudioLevelMonitor((l) => setLevel(micOn ? l : 0))
    monitor.start(stream)
    monitorRef.current = monitor
    return () => monitor.stop()
  }, [stream, micOn])

  const switchDevice = async (kind: "audioinput" | "videoinput", deviceId: string) => {
    const next = { ...prefs, [kind === "audioinput" ? "audioInput" : "videoInput"]: deviceId }
    setPrefs(next)
    saveDevicePreferences(next)

    streamRef.current?.getTracks().forEach((t) => t.stop())
    try {
      const captured = await getUserMedia(next)
      captured.getAudioTracks().forEach((t) => (t.enabled = micOn))
      captured.getVideoTracks().forEach((t) => (t.enabled = camOn))
      streamRef.current = captured
      setStream(captured)
    } catch {
      setError("Could not switch to that device.")
    }
  }

  const toggleMic = () => {
    const next = !micOn
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next))
    setMicOn(next)
  }

  const toggleCam = () => {
    const next = !camOn
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next))
    setCamOn(next)
  }

  const join = () => {
    if (!streamRef.current) return
    handedOffRef.current = true
    monitorRef.current?.stop()
    saveDevicePreferences(prefs)
    onJoin({ stream: streamRef.current, micOn, camOn, prefs })
  }

  const audioDevices = devices.filter((d) => d.kind === "audioinput")
  const videoDevices = devices.filter((d) => d.kind === "videoinput")

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 py-8 grain">
      <div className="aurora" />

      <div className="relative z-10 w-full max-w-5xl">
        <header className="mb-8 flex justify-center lg:justify-start">
          <Wordmark />
        </header>

        <div className="grid items-center gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* Preview */}
          <div className="space-y-3 animate-rise">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-stroke">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full -scale-x-100 object-cover transition-opacity duration-300",
                  camOn && stream ? "opacity-100" : "opacity-0",
                )}
              />

              {initializing && (
                <div className="absolute inset-0 grid place-items-center">
                  <Loader2 className="size-7 animate-spin text-muted-foreground" />
                </div>
              )}

              {!initializing && (!camOn || !stream) && (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,oklch(0.26_0.025_265),oklch(0.15_0.012_265))]">
                  <div className="flex flex-col items-center gap-3">
                    <InitialsAvatar name={userName} color={userColor} size={80} />
                    <span className="text-sm text-muted-foreground">
                      {error ? "Camera unavailable" : "Camera is off"}
                    </span>
                  </div>
                </div>
              )}

              {/* Preview controls float over the video, as they will in-call. */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-4">
                <PreviewToggle
                  on={micOn}
                  disabled={!stream}
                  onClick={toggleMic}
                  onIcon={<Mic />}
                  offIcon={<MicOff />}
                  label={micOn ? "Mute microphone" : "Unmute microphone"}
                />
                <PreviewToggle
                  on={camOn}
                  disabled={!stream}
                  onClick={toggleCam}
                  onIcon={<Video />}
                  offIcon={<VideoOff />}
                  label={camOn ? "Turn off camera" : "Turn on camera"}
                />
              </div>
            </div>

            {stream && (
              <div className="space-y-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <DeviceSelect
                    devices={audioDevices}
                    value={prefs.audioInput}
                    onChange={(id) => switchDevice("audioinput", id)}
                    icon={<Mic />}
                    label="Microphone"
                  />
                  <DeviceSelect
                    devices={videoDevices}
                    value={prefs.videoInput}
                    onChange={(id) => switchDevice("videoinput", id)}
                    icon={<Camera />}
                    label="Camera"
                  />
                </div>
                <LevelMeter level={level} />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}
          </div>

          {/* Join card */}
          <div className="animate-rise text-center lg:text-left" style={{ animationDelay: "80ms" }}>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {roomName}
            </h1>
            <p className="mt-2.5 font-mono text-sm tracking-wide text-muted-foreground">
              {roomCode}
            </p>

            <p className="mt-4 text-sm text-muted-foreground">
              Hosted by <span className="text-foreground/90">{hostName}</span>
            </p>

            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start">
              <Users className="size-4" />
              {occupancy === 0
                ? "You'll be the first one here"
                : `${occupancy} ${occupancy === 1 ? "person is" : "people are"} already here`}
            </div>

            <button
              type="button"
              onClick={join}
              disabled={!stream || initializing}
              className="mt-7 h-12 w-full rounded-xl bg-brand text-sm font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            >
              {initializing ? "Preparing your devices…" : "Join now"}
            </button>

            {!stream && !initializing && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 h-11 w-full rounded-xl border border-stroke text-sm font-medium text-foreground transition-colors hover:bg-white/5"
              >
                Retry camera access
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewToggle({
  on, onClick, onIcon, offIcon, label, disabled,
}: {
  on: boolean
  onClick: () => void
  onIcon: React.ReactNode
  offIcon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-11 place-items-center rounded-full backdrop-blur transition-all duration-200 active:scale-95 disabled:opacity-40",
        "[&_svg]:size-[18px]",
        on ? "bg-white/12 text-white hover:bg-white/20" : "bg-destructive text-white hover:brightness-110",
      )}
    >
      {on ? onIcon : offIcon}
    </button>
  )
}

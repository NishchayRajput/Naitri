"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
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
import { AudioBars } from "@/components/shared/AudioBars"
import {
  AlertCircle, ArrowLeft, ArrowRight, Camera, Check, Copy, Mic, MicOff, Video, VideoOff, Loader2, Users,
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

  const [copied, setCopied] = useState(false)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked by permissions policy; the code is visible.
    }
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
    <div className="relative min-h-dvh overflow-x-clip bg-canvas grain">
      <div className="ambient" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-5">
          <Link href="/" aria-label="Back to home">
            <Wordmark />
          </Link>
          <Link
            href="/"
            className="glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Home
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-8 pb-10 pt-2 lg:grid-cols-[1.45fr_1fr] lg:gap-12">
          {/* Preview */}
          <div className="space-y-4 animate-rise">
            <div className="relative aspect-video overflow-hidden rounded-[28px] bg-black shadow-float ring-1 ring-stroke-strong">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full -scale-x-100 object-cover transition-opacity duration-500",
                  camOn && stream ? "opacity-100" : "opacity-0",
                )}
              />

              {initializing && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="size-7 animate-spin" />
                    <span className="text-[13px]">Starting your camera…</span>
                  </div>
                </div>
              )}

              {!initializing && (!camOn || !stream) && (
                <div
                  className="absolute inset-0 grid place-items-center"
                  style={{
                    background: `radial-gradient(90% 80% at 50% 35%, color-mix(in oklab, ${userColor} 30%, transparent), transparent 70%), var(--surface)`,
                  }}
                >
                  <div className="flex flex-col items-center gap-3.5">
                    <InitialsAvatar name={userName} color={userColor} size={96} />
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {error ? "Camera unavailable" : "Your camera is off"}
                    </span>
                  </div>
                </div>
              )}

              {/* Scrims keep overlays legible over bright video. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 to-transparent" />

              <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-md">
                {micOn ? (
                  <AudioBars active={level > 0.08} className="text-brand" />
                ) : (
                  <MicOff className="size-3.5 text-destructive" />
                )}
                {userName}
              </span>

              {/* Preview controls float over the video, as they will in-call. */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center p-5">
                <div className="flex items-center gap-2 rounded-full bg-black/40 p-1.5 backdrop-blur-xl ring-1 ring-white/10">
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
            </div>

            {stream && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-2">
                  <DeviceSelect
                    devices={audioDevices}
                    value={prefs.audioInput}
                    onChange={(id) => switchDevice("audioinput", id)}
                    icon={<Mic />}
                    label="Microphone"
                  />
                  <LevelMeter level={level} />
                </div>
                <DeviceSelect
                  devices={videoDevices}
                  value={prefs.videoInput}
                  onChange={(id) => switchDevice("videoinput", id)}
                  icon={<Camera />}
                  label="Camera"
                />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}
          </div>

          {/* Join card */}
          <div className="animate-rise [animation-delay:100ms]">
            <div className="glass lit-edge rounded-[28px] p-7 shadow-float sm:p-8">
              <span className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="size-1.5 animate-blink rounded-full bg-brand" />
                Ready to join?
              </span>

              <h1 className="mt-3 text-balance text-[32px] font-semibold leading-tight tracking-tight text-foreground sm:text-[38px]">
                {roomName}
              </h1>

              <button
                type="button"
                onClick={copyLink}
                className="group mt-3 inline-flex items-center gap-2 rounded-lg border border-stroke bg-white/4 px-2.5 py-1 font-mono text-[13px] tracking-wide text-muted-foreground transition-colors hover:border-stroke-strong hover:text-foreground"
                aria-label="Copy meeting link"
              >
                {roomCode}
                {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
              </button>

              <div className="mt-7 space-y-3 border-t border-stroke pt-6">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={hostName} color="#a3a3a3" size={36} />
                  <div className="leading-tight">
                    <p className="text-[12px] text-muted-foreground">Hosted by</p>
                    <p className="text-[14px] font-medium text-foreground">{hostName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-white/6 text-muted-foreground">
                    <Users className="size-4" />
                  </span>
                  <p className="text-[14px] text-foreground/85">
                    {occupancy === 0
                      ? "You'll be the first one here"
                      : `${occupancy} ${occupancy === 1 ? "person is" : "people are"} already here`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={join}
                disabled={!stream || initializing}
                className="group mt-8 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-brand-ink shadow-[0_10px_40px_-12px_var(--brand)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-12px_var(--brand)] active:translate-y-0 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
              >
                {initializing ? "Preparing your devices…" : (
                  <>
                    Join now
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </button>

              {!stream && !initializing && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 h-12 w-full rounded-2xl border border-stroke text-[14px] font-medium text-foreground transition-colors hover:bg-white/5"
                >
                  Retry camera access
                </button>
              )}

              <p className="mt-4 text-center text-[12px] text-muted-foreground/70">
                Nobody can see or hear you until you join.
              </p>
            </div>
          </div>
        </main>
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
      title={label}
      className={cn(
        "grid size-12 place-items-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40",
        "[&_svg]:size-5",
        on ? "bg-white/12 text-white hover:bg-white/22" : "bg-destructive text-white hover:brightness-110",
      )}
    >
      {on ? onIcon : offIcon}
    </button>
  )
}

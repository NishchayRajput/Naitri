import type { TrackSource } from "@/types/signaling"

export interface DeviceOption {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

export interface DevicePreferences {
  audioInput?: string
  videoInput?: string
  audioOutput?: string
}

const PREFS_KEY = "naitri.devicePrefs"

export function loadDevicePreferences(): DevicePreferences {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as DevicePreferences
  } catch {
    return {}
  }
}

export function saveDevicePreferences(prefs: DevicePreferences): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Private browsing can reject writes; preferences are a convenience only.
  }
}

/**
 * Enumerates devices. Labels are empty until permission has been granted at
 * least once, which is why the lobby requests the stream before listing.
 */
export async function listDevices(): Promise<DeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []

  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind !== "videooutput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      kind: d.kind,
      label: d.label || `${friendlyKind(d.kind)} ${i + 1}`,
    }))
}

function friendlyKind(kind: MediaDeviceKind): string {
  switch (kind) {
    case "audioinput":
      return "Microphone"
    case "audiooutput":
      return "Speaker"
    default:
      return "Camera"
  }
}

export class MediaPermissionError extends Error {
  constructor(
    readonly kind: "denied" | "notfound" | "inuse" | "unknown",
    message: string,
  ) {
    super(message)
    this.name = "MediaPermissionError"
  }
}

/** Turns the browser's opaque getUserMedia errors into actionable messages. */
export function describeMediaError(err: unknown): MediaPermissionError {
  const name = err instanceof DOMException ? err.name : ""

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new MediaPermissionError(
        "denied",
        "Camera and microphone access was blocked. Allow it in your browser's address bar, then try again.",
      )
    case "NotFoundError":
    case "OverconstrainedError":
      return new MediaPermissionError(
        "notfound",
        "No camera or microphone was found. Check that one is connected.",
      )
    case "NotReadableError":
    case "AbortError":
      return new MediaPermissionError(
        "inuse",
        "Your camera or microphone is already in use by another app.",
      )
    default:
      return new MediaPermissionError("unknown", "Could not access your camera or microphone.")
  }
}

export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

export async function getUserMedia(prefs: DevicePreferences): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        ...VIDEO_CONSTRAINTS,
        ...(prefs.videoInput ? { deviceId: { exact: prefs.videoInput } } : {}),
      },
      audio: {
        ...AUDIO_CONSTRAINTS,
        ...(prefs.audioInput ? { deviceId: { exact: prefs.audioInput } } : {}),
      },
    })
  } catch (err) {
    // An exact deviceId that has since been unplugged throws; retry with
    // defaults rather than leaving the user with no media at all.
    if (err instanceof DOMException && err.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: AUDIO_CONSTRAINTS,
      })
    }
    throw describeMediaError(err)
  }
}

export async function getDisplayMedia(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      // Capturing tab audio makes shared videos audible to the room.
      audio: true,
    })
  } catch (err) {
    throw describeMediaError(err)
  }
}

export function sourceLabel(source: TrackSource): string {
  switch (source) {
    case "screen":
      return "Screen"
    case "screen-audio":
      return "Screen audio"
    case "microphone":
      return "Microphone"
    default:
      return "Camera"
  }
}

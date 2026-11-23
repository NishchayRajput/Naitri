"use client"

import { useEffect, useState } from "react"
import { listDevices, saveDevicePreferences, type DeviceOption, type DevicePreferences } from "@/lib/devices"
import { DeviceSelect } from "./DeviceSelect"
import { Camera, Mic, Settings2, X } from "lucide-react"

export function SettingsSheet({
  open,
  prefs,
  onClose,
  onSwitchDevice,
}: {
  open: boolean
  prefs: DevicePreferences
  onClose: () => void
  onSwitchDevice: (kind: "audioinput" | "videoinput", deviceId: string) => Promise<void>
}) {
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [current, setCurrent] = useState(prefs)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void listDevices().then(setDevices)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const change = async (kind: "audioinput" | "videoinput", deviceId: string) => {
    setBusy(true)
    const next = { ...current, [kind === "audioinput" ? "audioInput" : "videoInput"]: deviceId }
    setCurrent(next)
    saveDevicePreferences(next)
    try {
      await onSwitchDevice(kind, deviceId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 animate-fade">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meeting settings"
        className="glass-high lit-edge relative w-full max-w-md rounded-[28px] p-6 shadow-float animate-pop"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand/12 text-brand">
              <Settings2 className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">Settings</h2>
              <p className="text-[12px] text-muted-foreground">Audio and video devices</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">Microphone</span>
            <DeviceSelect
              devices={devices.filter((d) => d.kind === "audioinput")}
              value={current.audioInput}
              onChange={(id) => void change("audioinput", id)}
              icon={<Mic />}
              label="Microphone"
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">Camera</span>
            <DeviceSelect
              devices={devices.filter((d) => d.kind === "videoinput")}
              value={current.videoInput}
              onChange={(id) => void change("videoinput", id)}
              icon={<Camera />}
              label="Camera"
              disabled={busy}
            />
          </div>

          <p className="rounded-2xl bg-white/4 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            Switching devices mid-call replaces the track in place, so nobody
            sees you drop out.
          </p>
        </div>
      </div>
    </div>
  )
}

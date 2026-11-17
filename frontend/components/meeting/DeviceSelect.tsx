"use client"

import { cn } from "@/lib/utils"
import type { DeviceOption } from "@/lib/devices"
import { ChevronDown } from "lucide-react"

export function DeviceSelect({
  devices,
  value,
  onChange,
  icon,
  label,
  disabled,
}: {
  devices: DeviceOption[]
  value: string | undefined
  onChange: (deviceId: string) => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-xl border border-stroke bg-black/25 px-3 transition-colors",
        disabled ? "opacity-50" : "hover:border-stroke-strong focus-within:border-brand/50",
      )}
    >
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled || devices.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[13px] text-foreground outline-none"
      >
        {devices.length === 0 && <option value="">No devices found</option>}
        {devices.map((d) => (
          // Options render in the native popup, which uses the OS palette and
          // ignores the page theme, so they need explicit colours.
          <option key={d.deviceId} value={d.deviceId} className="bg-[#1b1b22] text-white">
            {d.label}
          </option>
        ))}
      </select>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
    </label>
  )
}

/** Horizontal input-level meter shown under the microphone picker. */
export function LevelMeter({ level }: { level: number }) {
  const bars = 16
  const lit = Math.round(level * bars)

  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-full rounded-full transition-colors duration-75",
            i < lit ? (i > bars - 4 ? "bg-amber-400" : "bg-live") : "bg-white/10",
          )}
        />
      ))}
    </div>
  )
}

"use client"

import { useEffect, useRef } from "react"

/**
 * Plays a remote peer's audio. Audio is deliberately decoupled from the video
 * tile: a tile can be unmounted by a layout change (pinning, pagination) and
 * that must never silence the person talking.
 */
export function AudioSink({ stream, peerId }: { stream: MediaStream; peerId: string }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    el.play().catch(() => {})
  }, [stream])

  return <audio ref={ref} autoPlay playsInline data-peer={peerId} className="hidden" />
}

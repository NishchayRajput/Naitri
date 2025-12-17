'use client'
import { useRef } from "react"
import { useWebRTC } from "@/hooks/useWebRTC"

export default function Call() {
  const localVideo = useRef<HTMLVideoElement>(null!)
  const remoteVideo = useRef<HTMLVideoElement>(null!)

  useWebRTC(
    "room1",
    crypto.randomUUID(),
    localVideo,
    remoteVideo
  )

  return (
    <div>
      <video ref={localVideo} autoPlay muted playsInline />
      <video ref={remoteVideo} autoPlay playsInline />
    </div>
  )
}

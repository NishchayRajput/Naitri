"use client"

import { useParams, useRouter } from "next/navigation"
import { useRef } from "react"
import { useWebRTC } from "@/hooks/useWebRTC"
import VideoTile from "@/components/VideoTile"
import Controls from "@/components/Controls"

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerIdRef = useRef(crypto.randomUUID())

  const {
    startScreenShare,
    stopScreenShare,
  } = useWebRTC(
    roomId,
    peerIdRef.current,
    localVideoRef,
    remoteVideoRef
  )

  const toggleMic = () => {
    localVideoRef.current?.srcObject
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !t.enabled))
  }

  const toggleCam = () => {
    localVideoRef.current?.srcObject
      ?.getVideoTracks()
      .forEach((t) => (t.enabled = !t.enabled))
  }

  const leaveCall = () => {
    router.push("/")
  }

  return (
    <div style={styles.container}>
      <h2>Room: {roomId}</h2>

      <div style={styles.videos}>
        <VideoTile videoRef={localVideoRef} label="You" muted />
        <VideoTile videoRef={remoteVideoRef} label="Remote" />
      </div>

      <Controls
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onShareScreen={startScreenShare}
        onStopShare={stopScreenShare}
        onLeave={leaveCall}
      />
    </div>
  )
}

const styles = {
  container: {
    padding: "20px",
    textAlign: "center" as const,
  },
  videos: {
    display: "flex",
    justifyContent: "center",
    gap: "20px",
    marginTop: "20px",
  },
}

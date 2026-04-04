"use client"

import { useParams, useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useWebRTC } from "@/hooks/useWebRTC"
import VideoTile from "@/components/VideoTile"
import Controls from "@/components/Controls"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

function RoomContent() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [isSharing, setIsSharing] = useState(false)

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
    const stream = localVideoRef.current?.srcObject as MediaStream | null
    stream?.getAudioTracks().forEach((t: MediaStreamTrack) => (t.enabled = !t.enabled))
    setIsMicOn(!isMicOn)
  }

  const toggleCam = () => {
    const stream = localVideoRef.current?.srcObject as MediaStream | null
    stream?.getVideoTracks().forEach((t: MediaStreamTrack) => (t.enabled = !t.enabled))
    setIsCamOn(!isCamOn)
  }

  const handleShareScreen = () => {
    startScreenShare()
    setIsSharing(true)
  }

  const handleStopShare = () => {
    stopScreenShare()
    setIsSharing(false)
  }

  const leaveCall = () => {
    // Stop all local media tracks
    const localStream = localVideoRef.current?.srcObject as MediaStream | null
    localStream?.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop()
    })

    // Stop all remote media tracks
    const remoteStream = remoteVideoRef.current?.srcObject as MediaStream | null
    remoteStream?.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop()
    })

    // Clear video sources
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }

    router.push("/")
  }

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-10 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1.5s'}}></div>
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Card className="shadow-2xl border-blue-200/50 dark:border-blue-800/50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5"></div>
            <div className="p-6 flex items-center justify-between relative z-10">
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 bg-clip-text text-transparent">
                  Video Room
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Share this room ID with others to join
                </p>
              </div>
              <Button
                variant="outline"
                onClick={copyRoomId}
                className="border-2 border-blue-300 dark:border-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-950/30 dark:hover:to-indigo-950/30 hover:scale-105 transition-all duration-300 shadow-lg"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-5 w-5 text-green-600 animate-bounce" />
                    <span className="font-mono font-semibold">{roomId}</span>
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-5 w-5" />
                    <span className="font-mono font-semibold">{roomId}</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Video Grid */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <div className="animate-slide-in-left">
            <VideoTile 
              videoRef={localVideoRef} 
              label={user?.name || "You"}
              muted 
              isCamOn={isCamOn}
            />
          </div>
          <div className="animate-slide-in-right">
            <VideoTile 
              videoRef={remoteVideoRef} 
              label="Remote User" 
              isCamOn={true}
            />
          </div>
        </div>

        {/* Controls */}
        <Controls
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onShareScreen={handleShareScreen}
          onStopShare={handleStopShare}
          onLeave={leaveCall}
          isMicOn={isMicOn}
          isCamOn={isCamOn}
          isSharing={isSharing}
        />
      </div>
    </div>
  )
}

export default function RoomPage() {
  return (
    <ProtectedRoute>
      <RoomContent />
    </ProtectedRoute>
  )
}

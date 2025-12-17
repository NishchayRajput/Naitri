"use client"

import { useParams } from "next/navigation"
import { useRef } from "react"
import { useWebRTC } from "@/hooks/useWebRTC"

export default function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>()

    const localVideoRef = useRef<HTMLVideoElement>(null!)
    const remoteVideoRef = useRef<HTMLVideoElement>(null!)

    // ✅ peerId MUST be stable
    const peerIdRef = useRef<string>(crypto.randomUUID())

    useWebRTC(
        roomId,
        peerIdRef.current,
        localVideoRef,
        remoteVideoRef
    )
    const { startScreenShare, stopScreenShare } = useWebRTC(
        roomId,
        peerIdRef.current,
        localVideoRef,
        remoteVideoRef
    )

    return (
        <div>
            <h2>Room: {roomId}</h2>

            <div style={{ display: "flex", gap: "20px" }}>
                <div>
                    <p>Local</p>
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: "300px" }}
                    />
                </div>

                <div>
                    <p>Remote</p>
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        style={{ width: "300px" }}
                    />
                </div>
            </div>
            <button onClick={startScreenShare}>Share Screen</button>
            <button onClick={stopScreenShare}>Stop Sharing</button>

        </div>
    )
}

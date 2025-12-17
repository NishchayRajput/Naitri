import { useEffect, useRef } from "react"

export function useWebRTC(
  roomId: string,
  peerId: string,
  localVideoRef: React.RefObject<HTMLVideoElement>,
  remoteVideoRef: React.RefObject<HTMLVideoElement>
) {
  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Perfect negotiation flags
  const makingOffer = useRef(false)
  const ignoreOffer = useRef(false)
  const isPolite = useRef(false)

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
    pcRef.current = pc

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0]
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ice",
            roomId,
            peerId,
            candidate: e.candidate,
          })
        )
      }
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    })

    const ws = new WebSocket(
      `ws://localhost:5000/ws?roomId=${roomId}&peerId=${peerId}`
    )
    wsRef.current = ws

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === "peer-joined") {
        isPolite.current = true
        return
      }

      if (msg.type === "offer") {
        const offerCollision =
          makingOffer.current || pc.signalingState !== "stable"

        ignoreOffer.current = !isPolite.current && offerCollision
        if (ignoreOffer.current) return

        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        ws.send(
          JSON.stringify({
            type: "answer",
            roomId,
            peerId,
            sdp: answer.sdp,
          })
        )
        return
      }

      if (msg.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp })
        return
      }

      if (msg.type === "ice" && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate)
        } catch (err) {
          if (!ignoreOffer.current) console.error(err)
        }
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current = true
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        ws.send(
          JSON.stringify({
            type: "offer",
            roomId,
            peerId,
            sdp: offer.sdp,
          })
        )
      } finally {
        makingOffer.current = false
      }
    }

    return () => {
      ws.close()
      pc.close()
    }
  }, [roomId, peerId])

  // ==============================
  // 🔥 SCREEN SHARING
  // ==============================

  const startScreenShare = async () => {
    if (!pcRef.current) return

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })

    screenStreamRef.current = screenStream

    const screenTrack = screenStream.getVideoTracks()[0]
    const sender = pcRef.current
      .getSenders()
      .find((s) => s.track?.kind === "video")

    if (sender) {
      await sender.replaceTrack(screenTrack)
    }

    // Show screen locally
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = screenStream
    }

    // When user stops sharing → restore camera
    screenTrack.onended = () => {
      stopScreenShare()
    }
  }

  const stopScreenShare = async () => {
    if (!pcRef.current || !localStreamRef.current) return

    const cameraTrack = localStreamRef.current.getVideoTracks()[0]
    const sender = pcRef.current
      .getSenders()
      .find((s) => s.track?.kind === "video")

    if (sender) {
      await sender.replaceTrack(cameraTrack)
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }

    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
  }

  return {
    startScreenShare,
    stopScreenShare,
  }
}

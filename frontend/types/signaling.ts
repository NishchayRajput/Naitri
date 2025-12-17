type SignalMessage = {
  type: "join" | "offer" | "answer" | "ice" | "leave"
  roomId: string
  peerId: string
  targetId?: string
  sdp?: string
  candidate?: RTCIceCandidateInit
}

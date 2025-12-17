// import { useEffect, useRef } from "react"

// export function useWebRTC(
//   roomId: string,
//   peerId: string,
//   localVideoRef: React.RefObject<HTMLVideoElement>,
//   remoteVideoRef: React.RefObject<HTMLVideoElement>
// ) {
//   const wsRef = useRef<WebSocket | null>(null)
//   const pcRef = useRef<RTCPeerConnection | null>(null)
//   const hasOfferedRef = useRef(false)

//   useEffect(() => {
//     const pc = new RTCPeerConnection({
//       iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//     })
//     pcRef.current = pc

//     pc.ontrack = (event) => {
//       console.log("REMOTE TRACK RECEIVED")
//       if (remoteVideoRef.current) {
//         remoteVideoRef.current.srcObject = event.streams[0]
//       }
//     }

//     pc.onicecandidate = (event) => {
//       if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             type: "ice",
//             roomId,
//             peerId,
//             candidate: event.candidate,
//           })
//         )
//       }
//     }

//     pc.onconnectionstatechange = () => {
//       console.log("PC STATE:", pc.connectionState)
//     }

//     navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
//       if (localVideoRef.current) {
//         localVideoRef.current.srcObject = stream
//       }
//       stream.getTracks().forEach((track) => pc.addTrack(track, stream))
//     })

//     const ws = new WebSocket(
//       `ws://localhost:5000/ws?roomId=${roomId}&peerId=${peerId}`
//     )
//     wsRef.current = ws

//     ws.onmessage = async (event) => {
//       const msg = JSON.parse(event.data)

//       switch (msg.type) {
//         case "peer-joined":
//           // ✅ BOTH peers renegotiate when a new peer joins
//           if (
//             pc.signalingState === "stable" &&
//             !hasOfferedRef.current
//           ) {
//             console.log("Renegotiating due to peer join")

//             const offer = await pc.createOffer()
//             await pc.setLocalDescription(offer)

//             ws.send(
//               JSON.stringify({
//                 type: "offer",
//                 roomId,
//                 peerId,
//                 sdp: offer.sdp,
//               })
//             )

//             hasOfferedRef.current = true
//           }
//           break


//         case "offer":
//           await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp })
//           const answer = await pc.createAnswer()
//           await pc.setLocalDescription(answer)

//           ws.send(
//             JSON.stringify({
//               type: "answer",
//               roomId,
//               peerId,
//               sdp: answer.sdp,
//             })
//           )
//           break

//         case "answer":
//           await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp })
//           hasOfferedRef.current = false

//           break

//         case "ice":
//           if (msg.candidate) {
//             await pc.addIceCandidate(msg.candidate)
//           }
//           break
//       }
//     }

//     return () => {
//       ws.close()
//       pc.close()
//     }
//   }, [roomId, peerId])
// }


import { useEffect, useRef } from "react"

export function useWebRTC(
  roomId: string,
  peerId: string,
  localVideoRef: React.RefObject<HTMLVideoElement>,
  remoteVideoRef: React.RefObject<HTMLVideoElement>
) {
  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

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
      console.log("REMOTE TRACK RECEIVED")
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

    pc.onconnectionstatechange = () => {
      console.log("PC STATE:", pc.connectionState)
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
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
        // second peer is polite
        isPolite.current = true
        return
      }

      if (msg.type === "offer") {
        const offerCollision =
          makingOffer.current || pc.signalingState !== "stable"

        ignoreOffer.current = !isPolite.current && offerCollision
        if (ignoreOffer.current) {
          console.warn("Ignoring offer (collision)")
          return
        }

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
          if (!ignoreOffer.current) {
            console.error(err)
          }
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
      } catch (err) {
        console.error(err)
      } finally {
        makingOffer.current = false
      }
    }

    return () => {
      ws.close()
      pc.close()
    }
  }, [roomId, peerId])
}

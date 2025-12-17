"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const [roomId, setRoomId] = useState("")
  const router = useRouter()

  const joinRoom = () => {
    if (!roomId.trim()) return
    router.push(`/room/${roomId}`)
  }

  return (
    <div style={styles.container}>
      <h1>Join a Video Room</h1>

      <input
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        style={styles.input}
      />

      <button onClick={joinRoom} style={styles.button}>
        Join Room
      </button>
    </div>
  )
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
  },
  input: {
    padding: "10px",
    fontSize: "16px",
    width: "220px",
  },
  button: {
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer",
  },
}

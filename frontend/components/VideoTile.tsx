import React from "react"

export default function VideoTile({
  videoRef,
  label,
  muted = false,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  label: string
  muted?: boolean
}) {
  return (
    <div style={styles.wrapper}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={styles.video}
      />
      <span style={styles.label}>{label}</span>
    </div>
  )
}

const styles = {
  wrapper: {
    position: "relative" as const,
  },
  video: {
    width: "320px",
    height: "200px",
    background: "#000",
    borderRadius: "8px",
  },
  label: {
    position: "absolute" as const,
    bottom: "8px",
    left: "8px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
  },
}

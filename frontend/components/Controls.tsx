export default function Controls({
  onToggleMic,
  onToggleCam,
  onShareScreen,
  onStopShare,
  onLeave,
}: {
  onToggleMic: () => void
  onToggleCam: () => void
  onShareScreen: () => void
  onStopShare: () => void
  onLeave: () => void
}) {
  return (
    <div style={styles.bar}>
      <button onClick={onToggleMic}>🎤 Mic</button>
      <button onClick={onToggleCam}>📷 Camera</button>
      <button onClick={onShareScreen}>🖥 Share</button>
      <button onClick={onStopShare}>❌ Stop Share</button>
      <button onClick={onLeave} style={{ background: "#e74c3c", color: "#fff" }}>
        Leave
      </button>
    </div>
  )
}

const styles = {
  bar: {
    display: "flex",
    gap: "10px",
    marginTop: "20px",
  },
}

import type { ClientMessage, ServerMessage } from "@/types/signaling"

export type SignalingStatus = "connecting" | "open" | "reconnecting" | "closed"

interface SignalingOptions {
  /** Resolves a fresh socket URL. Called again before every reconnect so a
   *  stale access token never wedges the retry loop. */
  resolveUrl: () => Promise<string | null>
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: SignalingStatus) => void
  /** Fired when a NEW socket opens after a drop. The server treats every
   *  socket as a fresh peer session, so the caller must republish its media
   *  rather than assume the old session survived. */
  onReconnected: () => void
  onFatal: (code: string, message: string) => void
}

const MAX_BACKOFF_MS = 15_000
const HEARTBEAT_MS = 25_000

export class SignalingClient {
  private socket: WebSocket | null = null
  private opts: SignalingOptions
  private closedByUs = false
  private attempt = 0
  private hasConnectedOnce = false
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: SignalingOptions) {
    this.opts = opts
  }

  async connect(): Promise<void> {
    this.closedByUs = false
    await this.open()
  }

  private async open(): Promise<void> {
    if (this.closedByUs) return

    this.opts.onStatus(this.hasConnectedOnce ? "reconnecting" : "connecting")

    const url = await this.opts.resolveUrl()
    if (!url) {
      this.opts.onFatal("unauthenticated", "Your session expired. Please sign in again.")
      return
    }
    if (this.closedByUs) return

    const socket = new WebSocket(url)
    this.socket = socket

    socket.onopen = () => {
      this.attempt = 0
      this.opts.onStatus("open")
      this.startHeartbeat()

      if (this.hasConnectedOnce) this.opts.onReconnected()
      this.hasConnectedOnce = true
    }

    socket.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }

      // A fatal error means retrying cannot help (room full, kicked, session
      // invalid), so stop the reconnect loop rather than hammering the server.
      if ((msg.type === "error" || msg.type === "removed") && msg.payload?.fatal) {
        this.closedByUs = true
        this.opts.onFatal(msg.payload.code, msg.payload.message)
      }

      this.opts.onMessage(msg)
    }

    socket.onclose = () => {
      this.stopHeartbeat()
      if (this.closedByUs) {
        this.opts.onStatus("closed")
        return
      }
      this.scheduleReconnect()
    }

    socket.onerror = () => {
      // onclose always follows, and that is where reconnection is handled.
    }
  }

  private scheduleReconnect() {
    this.opts.onStatus("reconnecting")

    // Exponential backoff with jitter so a server restart does not produce a
    // synchronised stampede from every client in every room.
    const base = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS)
    const delay = base * (0.5 + Math.random() * 0.5)
    this.attempt += 1

    this.retryTimer = setTimeout(() => {
      void this.open()
    }, delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      this.send({ type: "ping" })
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(msg))
  }

  close(): void {
    this.closedByUs = true
    this.stopHeartbeat()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.opts.onStatus("closed")
  }
}

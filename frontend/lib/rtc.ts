import type { ClientMessage, Target, TrackSource } from "@/types/signaling"
import { parseStreamId } from "@/types/signaling"

export interface RemoteTrackEvent {
  peerId: string
  source: TrackSource
  track: MediaStreamTrack
  stream: MediaStream
}

interface RtcOptions {
  iceServers: RTCIceServer[]
  send: (msg: ClientMessage) => void
  onRemoteTrack: (event: RemoteTrackEvent) => void
  onRemoteTrackEnded: (peerId: string, source: TrackSource) => void
  onConnectionStateChange: (target: Target, state: RTCPeerConnectionState) => void
}

/**
 * Client side of the split publisher/subscriber transport.
 *
 *   publisher  — we always create the offer, the SFU answers.
 *   subscriber — the SFU always creates the offer, we answer.
 *
 * Each connection has exactly one offerer, so offer glare cannot occur and
 * none of the perfect-negotiation rollback machinery is needed.
 */
export class RtcTransport {
  readonly publisher: RTCPeerConnection
  readonly subscriber: RTCPeerConnection

  private opts: RtcOptions
  private closed = false

  /** MediaStreamTrack.id -> source, sent alongside each publisher offer. */
  private sources = new Map<string, TrackSource>()

  /** Candidates that arrived before the matching remote description. */
  private pendingCandidates: Record<Target, RTCIceCandidateInit[]> = {
    publisher: [],
    subscriber: [],
  }

  private negotiating = false
  private renegotiateQueued = false

  constructor(opts: RtcOptions) {
    this.opts = opts

    const config: RTCConfiguration = {
      iceServers: opts.iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    }

    this.publisher = new RTCPeerConnection(config)
    this.subscriber = new RTCPeerConnection(config)

    this.publisher.onicecandidate = (e) => this.trickle("publisher", e.candidate)
    this.subscriber.onicecandidate = (e) => this.trickle("subscriber", e.candidate)

    this.publisher.onconnectionstatechange = () =>
      this.opts.onConnectionStateChange("publisher", this.publisher.connectionState)
    this.subscriber.onconnectionstatechange = () =>
      this.opts.onConnectionStateChange("subscriber", this.subscriber.connectionState)

    this.publisher.onnegotiationneeded = () => {
      void this.negotiatePublisher()
    }

    this.subscriber.ontrack = (event) => this.handleRemoteTrack(event)
  }

  private trickle(target: Target, candidate: RTCIceCandidate | null) {
    if (this.closed) return
    this.opts.send({
      type: "trickle",
      payload: { target, candidate: candidate ? candidate.toJSON() : null },
    })
  }

  private handleRemoteTrack(event: RTCTrackEvent) {
    const stream = event.streams[0]
    if (!stream) return

    // The SFU sets the outgoing stream id to `<peerId>:<source>`, so a track's
    // owner and purpose arrive atomically with the track itself.
    const parsed = parseStreamId(stream.id)
    if (!parsed) return

    const { peerId, source } = parsed

    // `ended` does not fire reliably for remote tracks across browsers, so
    // removal is also driven by the server's track-unpublished message.
    event.track.onended = () => this.opts.onRemoteTrackEnded(peerId, source)

    this.opts.onRemoteTrack({ peerId, source, track: event.track, stream })
  }

  /** Publishes a track and declares its source to the SFU. */
  async publish(
    track: MediaStreamTrack,
    stream: MediaStream,
    source: TrackSource,
  ): Promise<RTCRtpSender> {
    this.sources.set(track.id, source)
    const sender = this.publisher.addTrack(track, stream)
    // addTrack fires onnegotiationneeded, which drives the offer.
    return sender
  }

  /** Swaps the media on an existing sender without renegotiating. */
  async replaceTrack(
    sender: RTCRtpSender,
    track: MediaStreamTrack | null,
    source?: TrackSource,
  ): Promise<void> {
    if (track && source) this.sources.set(track.id, source)
    await sender.replaceTrack(track)
  }

  unpublish(sender: RTCRtpSender): void {
    if (sender.track) this.sources.delete(sender.track.id)
    this.publisher.removeTrack(sender)
  }

  /**
   * Offers the current publisher track set. Concurrent requests collapse into
   * a single trailing renegotiation, so a burst of publishes produces one
   * offer rather than a pile-up.
   */
  private async negotiatePublisher(): Promise<void> {
    if (this.closed) return

    if (this.negotiating || this.publisher.signalingState !== "stable") {
      this.renegotiateQueued = true
      return
    }

    this.negotiating = true
    try {
      const offer = await this.publisher.createOffer()
      // signalingState can change while createOffer is awaited.
      if (this.closed || this.publisher.signalingState !== "stable") {
        this.renegotiateQueued = true
        return
      }
      await this.publisher.setLocalDescription(offer)

      this.opts.send({
        type: "publisher-offer",
        payload: {
          sdp: this.publisher.localDescription!.toJSON(),
          tracks: Object.fromEntries(this.sources),
        },
      })
    } catch (err) {
      console.error("[rtc] publisher negotiation failed", err)
    } finally {
      this.negotiating = false
    }
  }

  async handlePublisherAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed) return

    await this.publisher.setRemoteDescription(sdp)
    await this.flushCandidates("publisher")

    if (this.renegotiateQueued) {
      this.renegotiateQueued = false
      await this.negotiatePublisher()
    }
  }

  /** The SFU is the offerer here, so this path is a plain answer. */
  async handleSubscriberOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed) return

    await this.subscriber.setRemoteDescription(sdp)
    await this.flushCandidates("subscriber")

    const answer = await this.subscriber.createAnswer()
    await this.subscriber.setLocalDescription(answer)

    this.opts.send({
      type: "subscriber-answer",
      payload: { sdp: this.subscriber.localDescription!.toJSON() },
    })
  }

  async handleTrickle(target: Target, candidate: RTCIceCandidateInit | null): Promise<void> {
    if (this.closed || !candidate) return

    const pc = target === "publisher" ? this.publisher : this.subscriber

    // addIceCandidate throws if the remote description is not set yet, which
    // is common: candidates race ahead of the SDP they belong to.
    if (!pc.remoteDescription) {
      this.pendingCandidates[target].push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(candidate)
    } catch (err) {
      console.warn(`[rtc] failed to add ${target} candidate`, err)
    }
  }

  private async flushCandidates(target: Target): Promise<void> {
    const pc = target === "publisher" ? this.publisher : this.subscriber
    const queued = this.pendingCandidates[target]
    this.pendingCandidates[target] = []

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch (err) {
        console.warn(`[rtc] failed to flush ${target} candidate`, err)
      }
    }
  }

  /** Reports outbound video resolution and bitrate for the stats overlay. */
  async getOutboundStats(): Promise<{ kbps: number; width: number; height: number } | null> {
    if (this.closed) return null

    const stats = await this.publisher.getStats()
    let result: { kbps: number; width: number; height: number } | null = null

    stats.forEach((report) => {
      if (report.type === "outbound-rtp" && report.kind === "video") {
        result = {
          kbps: Math.round(((report.bytesSent ?? 0) * 8) / 1000),
          width: report.frameWidth ?? 0,
          height: report.frameHeight ?? 0,
        }
      }
    })
    return result
  }

  close(): void {
    if (this.closed) return
    this.closed = true

    this.publisher.onicecandidate = null
    this.publisher.onnegotiationneeded = null
    this.publisher.onconnectionstatechange = null
    this.subscriber.onicecandidate = null
    this.subscriber.ontrack = null
    this.subscriber.onconnectionstatechange = null

    this.publisher.close()
    this.subscriber.close()
    this.sources.clear()
  }
}

/**
 * Wire protocol shared with the Go SFU (see backend/internal/sfu/types.go).
 * Keep the two in sync: these are the exact JSON shapes on the socket.
 */

export type Target = "publisher" | "subscriber"

export type TrackSource = "camera" | "microphone" | "screen" | "screen-audio"

export interface PeerState {
  micOn: boolean
  camOn: boolean
  screenOn: boolean
  handRaised: boolean
  speaking: boolean
}

export interface Participant {
  peerId: string
  userId: string
  name: string
  avatarColor: string
  isHost: boolean
  joinedAt: string
  state: PeerState
}

export interface RoomInfo {
  code: string
  name: string
  hostName: string
  locked: boolean
}

export interface TrackInfo {
  peerId: string
  trackId: string
  streamId: string
  kind: "audio" | "video"
  source: TrackSource
}

export interface WelcomePayload {
  self: Participant
  room: RoomInfo
  participants: Participant[]
  iceServers: RTCIceServer[]
  tracks: TrackInfo[]
}

export interface ChatMessage {
  id: string
  peerId: string
  name: string
  avatarColor: string
  text: string
  at: string
}

export interface ErrorPayload {
  code: string
  message: string
  fatal: boolean
}

/** Messages the server sends to us. */
export type ServerMessage =
  | { type: "welcome"; payload: WelcomePayload }
  | { type: "publisher-answer"; payload: { sdp: RTCSessionDescriptionInit } }
  | { type: "subscriber-offer"; payload: { sdp: RTCSessionDescriptionInit } }
  | { type: "trickle"; payload: { target: Target; candidate: RTCIceCandidateInit | null } }
  | { type: "peer-joined"; payload: Participant }
  | { type: "peer-left"; payload: { peerId: string } }
  | { type: "peer-state"; payload: { peerId: string; state: PeerState } }
  | { type: "track-published"; payload: TrackInfo }
  | { type: "track-unpublished"; payload: TrackInfo }
  | { type: "chat"; payload: ChatMessage }
  | { type: "room-locked"; payload: { locked: boolean } }
  | { type: "removed"; payload: ErrorPayload }
  | { type: "error"; payload: ErrorPayload }
  | { type: "pong"; payload?: never }

/** Messages we send to the server. */
export type ClientMessage =
  | {
      type: "publisher-offer"
      payload: {
        sdp: RTCSessionDescriptionInit
        /**
         * MediaStreamTrack.id -> source for the tracks in this offer. The
         * browser assigns MediaStream ids and gives no way to set them, so the
         * source cannot ride in the msid and is declared here instead.
         */
        tracks: Record<string, TrackSource>
      }
    }
  | { type: "subscriber-answer"; payload: { sdp: RTCSessionDescriptionInit } }
  | { type: "trickle"; payload: { target: Target; candidate: RTCIceCandidateInit | null } }
  | { type: "state"; payload: PeerState }
  | { type: "chat"; payload: { text: string } }
  | { type: "lock"; payload: { locked: boolean } }
  | { type: "remove-peer"; payload: { peerId: string } }
  | { type: "ping" }

/**
 * The SFU encodes ownership and intent in the outgoing MediaStream id as
 * `<peerId>:<source>`, so a track's meaning arrives atomically with the track
 * itself rather than in a separate message that could be reordered.
 */
export function parseStreamId(streamId: string): { peerId: string; source: TrackSource } | null {
  const sep = streamId.lastIndexOf(":")
  if (sep <= 0) return null
  return {
    peerId: streamId.slice(0, sep),
    source: streamId.slice(sep + 1) as TrackSource,
  }
}

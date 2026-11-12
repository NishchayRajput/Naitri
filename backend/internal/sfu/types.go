package sfu

import (
	"encoding/json"
	"time"

	"github.com/pion/webrtc/v4"
)

// Target names which of a peer's two PeerConnections a message refers to.
//
// The SFU deliberately uses a split publisher/subscriber design:
//
//	publisher  — the client ALWAYS offers, the server ALWAYS answers.
//	subscriber — the server ALWAYS offers, the client ALWAYS answers.
//
// Because each connection has exactly one designated offerer, offer glare is
// structurally impossible and neither side needs perfect-negotiation rollback.
type Target string

const (
	TargetPublisher  Target = "publisher"
	TargetSubscriber Target = "subscriber"
)

// TrackSource distinguishes a webcam feed from a screen share. It travels in
// the MediaStream id rather than a side-channel message, so it stays correct
// across renegotiation and cannot arrive out of order with the track itself.
type TrackSource string

const (
	SourceCamera      TrackSource = "camera"
	SourceMicrophone  TrackSource = "microphone"
	SourceScreen      TrackSource = "screen"
	SourceScreenAudio TrackSource = "screen-audio"
)

func ParseSource(s string) TrackSource {
	switch TrackSource(s) {
	case SourceCamera, SourceMicrophone, SourceScreen, SourceScreenAudio:
		return TrackSource(s)
	default:
		return SourceCamera
	}
}

// Message is the envelope for every frame on the signaling socket.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// ---- client -> server payloads ----

type SDPPayload struct {
	SDP webrtc.SessionDescription `json:"sdp"`
}

type TricklePayload struct {
	Target    Target                   `json:"target"`
	Candidate *webrtc.ICECandidateInit `json:"candidate"`
}

type ChatPayload struct {
	Text string `json:"text"`
}

type LockPayload struct {
	Locked bool `json:"locked"`
}

type RemovePeerPayload struct {
	PeerID string `json:"peerId"`
}

// ---- shared ----

// PeerState is the mutable presence information shown in the participant list.
type PeerState struct {
	MicOn      bool `json:"micOn"`
	CamOn      bool `json:"camOn"`
	Screen     bool `json:"screenOn"`
	HandRaised bool `json:"handRaised"`
	Speaking   bool `json:"speaking"`
}

// Participant is a peer as seen by other clients.
type Participant struct {
	PeerID      string    `json:"peerId"`
	UserID      string    `json:"userId"`
	Name        string    `json:"name"`
	AvatarColor string    `json:"avatarColor"`
	IsHost      bool      `json:"isHost"`
	JoinedAt    time.Time `json:"joinedAt"`
	State       PeerState `json:"state"`
}

// ---- server -> client payloads ----

type WelcomePayload struct {
	Self         Participant        `json:"self"`
	Room         RoomInfo           `json:"room"`
	Participants []Participant      `json:"participants"`
	ICEServers   []webrtc.ICEServer `json:"iceServers"`
	Tracks       []TrackInfo        `json:"tracks"`
}

type RoomInfo struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	HostName string `json:"hostName"`
	Locked   bool   `json:"locked"`
}

type TrackInfo struct {
	PeerID   string      `json:"peerId"`
	TrackID  string      `json:"trackId"`
	StreamID string      `json:"streamId"`
	Kind     string      `json:"kind"`
	Source   TrackSource `json:"source"`
}

type PeerStatePayload struct {
	PeerID string    `json:"peerId"`
	State  PeerState `json:"state"`
}

type PeerLeftPayload struct {
	PeerID string `json:"peerId"`
}

type ChatMessage struct {
	ID          string    `json:"id"`
	PeerID      string    `json:"peerId"`
	Name        string    `json:"name"`
	AvatarColor string    `json:"avatarColor"`
	Text        string    `json:"text"`
	At          time.Time `json:"at"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Fatal   bool   `json:"fatal"`
}

// Message type constants, shared with the TypeScript client.
const (
	// client -> server
	TypePublisherOffer   = "publisher-offer"
	TypeSubscriberAnswer = "subscriber-answer"
	TypeTrickle          = "trickle"
	TypeState            = "state"
	TypeChat             = "chat"
	TypeLock             = "lock"
	TypeRemovePeer       = "remove-peer"
	TypePing             = "ping"

	// server -> client
	TypeWelcome          = "welcome"
	TypePublisherAnswer  = "publisher-answer"
	TypeSubscriberOffer  = "subscriber-offer"
	TypePeerJoined       = "peer-joined"
	TypePeerLeft         = "peer-left"
	TypePeerState        = "peer-state"
	TypeTrackPublished   = "track-published"
	TypeTrackUnpublished = "track-unpublished"
	TypeRoomLocked       = "room-locked"
	TypeRemoved          = "removed"
	TypeError            = "error"
	TypePong             = "pong"
)

func newMessage(typ string, payload any) (Message, error) {
	if payload == nil {
		return Message{Type: typ}, nil
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return Message{}, err
	}
	return Message{Type: typ, Payload: raw}, nil
}

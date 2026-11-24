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

// ParseSource validates a declared source, falling back to the sensible
// default for the track's media kind.
func ParseSource(s TrackSource, kind webrtc.RTPCodecType) TrackSource {
	switch s {
	case SourceCamera, SourceMicrophone, SourceScreen, SourceScreenAudio:
		return s
	}
	if kind == webrtc.RTPCodecTypeAudio {
		return SourceMicrophone
	}
	return SourceCamera
}

// Message is the envelope for every frame on the signaling socket.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// ---- client -> server payloads ----

type SDPPayload struct {
	SDP webrtc.SessionDescription `json:"sdp"`
	// Tracks maps MediaStreamTrack.id -> source for the tracks carried by this
	// offer. The browser assigns MediaStream ids itself and gives no way to set
	// them, so the source cannot ride along in the msid; it is declared here
	// instead. The map is recorded before SetRemoteDescription, so it is always
	// populated by the time OnTrack fires.
	Tracks map[string]TrackSource `json:"tracks,omitempty"`
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
	Board        BoardSnapshot      `json:"board"`
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

// Whiteboard payloads.

type BoardOpenPayload struct {
	Open bool `json:"open"`
}

type BoardStatePayload struct {
	Open bool   `json:"open"`
	By   string `json:"by"`
	Name string `json:"name"`
}

type BoardErasePayload struct {
	IDs []string `json:"ids"`
	By  string   `json:"by,omitempty"`
}

type BoardClearPayload struct {
	By   string `json:"by"`
	Name string `json:"name"`
}

type BoardCursorPayload struct {
	PeerID string  `json:"peerId,omitempty"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Active bool    `json:"active"`
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

	// Whiteboard; the same names are used in both directions except
	// board-open (client) / board-state (server).
	TypeBoardOpen   = "board-open"
	TypeBoardStroke = "board-stroke"
	TypeBoardErase  = "board-erase"
	TypeBoardClear  = "board-clear"
	TypeBoardCursor = "board-cursor"
	TypeBoardState  = "board-state"

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

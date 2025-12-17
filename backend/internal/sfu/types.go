package sfu

import "encoding/json"

type SignalMessage struct {
	Type      string          `json:"type"`
	RoomID    string          `json:"roomId,omitempty"`
	PeerID    string          `json:"peerId,omitempty"`
	TargetID  string          `json:"targetId,omitempty"`
	SDP       string          `json:"sdp,omitempty"`
	Candidate json.RawMessage `json:"candidate,omitempty"`
}

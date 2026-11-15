package sfu

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

const maxChatLen = 2000

// Identity is the authenticated user behind a signaling socket.
type Identity struct {
	UserID      string
	Name        string
	AvatarColor string
	IsHost      bool
}

// Hooks lets the SFU persist state changes without importing the service
// layer, which would create an import cycle.
type Hooks struct {
	OnLockChange func(ctx context.Context, code string, locked bool) error
}

func (m *Manager) SetHooks(h Hooks) { m.hooks = h }

// Join attaches an authenticated socket to a room and blocks until the peer
// disconnects. The caller is the HTTP handler goroutine.
func (m *Manager) Join(conn *websocket.Conn, room *Room, id Identity) {
	ctx, cancel := context.WithCancel(context.Background())

	peerID := uuid.NewString()
	log := m.log.With("room", room.Code, "peer", peerID)

	cfg := webrtc.Configuration{ICEServers: m.iceServers}

	publisher, err := m.api.NewPeerConnection(cfg)
	if err != nil {
		log.Error("create publisher pc", "error", err)
		cancel()
		_ = conn.Close()
		return
	}
	subscriber, err := m.api.NewPeerConnection(cfg)
	if err != nil {
		log.Error("create subscriber pc", "error", err)
		_ = publisher.Close()
		cancel()
		_ = conn.Close()
		return
	}

	peer := &Peer{
		ID:           peerID,
		UserID:       id.UserID,
		Name:         sanitizeName(id.Name),
		AvatarColor:  id.AvatarColor,
		IsHost:       id.IsHost,
		JoinedAt:     time.Now().UTC(),
		log:          log,
		conn:         conn,
		publisher:    publisher,
		subscriber:   subscriber,
		send:         make(chan Message, sendQueue),
		ctx:          ctx,
		cancel:       cancel,
		state:        PeerState{MicOn: true, CamOn: true},
		trackSources: make(map[string]TrackSource),
	}

	m.wirePeerConnections(peer, room)

	// A data channel guarantees the subscriber offer has at least one m-line,
	// so the subscriber transport connects at join time instead of lying
	// dormant until someone publishes media.
	if _, err := subscriber.CreateDataChannel("naitri", nil); err != nil {
		log.Error("create subscriber data channel", "error", err)
	}

	go peer.writePump()

	if err := room.AddPeer(peer); err != nil {
		peer.SendError("room_full", "This meeting is full.", true)
		// Give the write pump a moment to flush the reason before teardown.
		time.Sleep(100 * time.Millisecond)
		peer.Close()
		return
	}

	peer.Send(TypeWelcome, WelcomePayload{
		Self:         peer.Participant(),
		Room:         room.Info,
		Participants: otherParticipants(room, peerID),
		ICEServers:   m.iceServers,
		Tracks:       room.TrackInfos(),
	})

	// Attach whatever is already being published, then open the subscriber
	// transport.
	room.SubscribeToExisting(peer)
	peer.Negotiate()

	// Blocks for the peer's lifetime.
	m.readPump(peer, room)

	room.RemovePeer(peerID)
}

func otherParticipants(room *Room, selfID string) []Participant {
	all := room.Participants()
	out := make([]Participant, 0, len(all))
	for _, p := range all {
		if p.PeerID != selfID {
			out = append(out, p)
		}
	}
	return out
}

func (m *Manager) wirePeerConnections(peer *Peer, room *Room) {
	peer.publisher.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		init := c.ToJSON()
		peer.Send(TypeTrickle, TricklePayload{Target: TargetPublisher, Candidate: &init})
	})

	peer.subscriber.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		init := c.ToJSON()
		peer.Send(TypeTrickle, TricklePayload{Target: TargetSubscriber, Candidate: &init})
	})

	peer.publisher.OnTrack(func(remote *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		room.PublishTrack(peer, remote, receiver)
	})

	// A failed transport will not recover on its own; tear the peer down so the
	// client reconnects with a fresh one rather than sitting in a dead call.
	peer.publisher.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		peer.log.Debug("publisher state", "state", s.String())
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			peer.Close()
		}
	})
	peer.subscriber.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		peer.log.Debug("subscriber state", "state", s.String())
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			peer.Close()
		}
	})
}

// readPump consumes the signaling socket until it closes or the peer is torn
// down elsewhere.
func (m *Manager) readPump(peer *Peer, room *Room) {
	defer peer.Close()

	peer.conn.SetReadLimit(maxMessage)
	_ = peer.conn.SetReadDeadline(time.Now().Add(pongWait))
	peer.conn.SetPongHandler(func(string) error {
		return peer.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		var msg Message
		if err := peer.conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				peer.log.Debug("socket read ended", "error", err)
			}
			return
		}

		if err := m.handle(peer, room, msg); err != nil {
			peer.log.Warn("handle signaling message", "type", msg.Type, "error", err)
			peer.SendError("signaling_error", "Could not process that request.", false)
		}
	}
}

func (m *Manager) handle(peer *Peer, room *Room, msg Message) error {
	switch msg.Type {
	case TypePing:
		peer.Send(TypePong, nil)
		return nil

	case TypePublisherOffer:
		var p SDPPayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		// Recorded first: OnTrack fires from within SetRemoteDescription.
		peer.recordSources(p.Tracks)
		return peer.HandlePublisherOffer(p.SDP)

	case TypeSubscriberAnswer:
		var p SDPPayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		return peer.HandleSubscriberAnswer(p.SDP)

	case TypeTrickle:
		var p TricklePayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		if p.Candidate == nil {
			return nil // end-of-candidates marker
		}
		return peer.addCandidate(p.Target, *p.Candidate)

	case TypeState:
		var state PeerState
		if err := decodePayload(msg.Payload, &state); err != nil {
			return err
		}
		peer.SetState(state)
		room.Broadcast(TypePeerState,
			PeerStatePayload{PeerID: peer.ID, State: state}, peer.ID)
		return nil

	case TypeChat:
		var p ChatPayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		text := strings.TrimSpace(p.Text)
		if text == "" {
			return nil
		}
		if utf8.RuneCountInString(text) > maxChatLen {
			text = string([]rune(text)[:maxChatLen])
		}
		// Echoed to the sender too, so message ordering and timestamps are
		// server-authoritative and identical for everyone.
		room.Broadcast(TypeChat, ChatMessage{
			ID:          uuid.NewString(),
			PeerID:      peer.ID,
			Name:        peer.Name,
			AvatarColor: peer.AvatarColor,
			Text:        text,
			At:          time.Now().UTC(),
		}, "")
		return nil

	case TypeLock:
		if !peer.IsHost {
			peer.SendError("forbidden", "Only the host can lock the meeting.", false)
			return nil
		}
		var p LockPayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		if m.hooks.OnLockChange != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := m.hooks.OnLockChange(ctx, room.Code, p.Locked); err != nil {
				return err
			}
		}
		room.SetLocked(p.Locked)
		return nil

	case TypeRemovePeer:
		if !peer.IsHost {
			peer.SendError("forbidden", "Only the host can remove participants.", false)
			return nil
		}
		var p RemovePeerPayload
		if err := decodePayload(msg.Payload, &p); err != nil {
			return err
		}
		if p.PeerID == peer.ID {
			return nil
		}
		target := room.Peer(p.PeerID)
		if target == nil {
			return nil
		}
		target.Send(TypeRemoved, ErrorPayload{
			Code:    "removed_by_host",
			Message: "The host removed you from the meeting.",
			Fatal:   true,
		})
		// Let the notice flush before closing the socket under it.
		go func() {
			time.Sleep(200 * time.Millisecond)
			target.Close()
		}()
		return nil

	default:
		return errors.New("unknown message type: " + msg.Type)
	}
}

// Upgrader validates the Origin header against the configured allowlist. The
// browser does not apply CORS to WebSocket handshakes, so this check is the
// only thing preventing any website from opening an authenticated socket.
func NewUpgrader(allowedOrigins []string, log *slog.Logger) *websocket.Upgrader {
	allowAll := false
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o == "*" {
			allowAll = true
		}
		allowed[o] = struct{}{}
	}

	return &websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			if allowAll {
				return true
			}
			origin := r.Header.Get("Origin")
			if origin == "" {
				// Non-browser client; there is no ambient credential to abuse.
				return true
			}
			_, ok := allowed[origin]
			if !ok {
				log.Warn("rejected websocket origin", "origin", origin)
			}
			return ok
		},
	}
}

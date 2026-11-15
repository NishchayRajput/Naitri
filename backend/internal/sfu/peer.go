package sfu

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

const (
	// sendQueue is sized to absorb a burst of renegotiation during a mass join
	// without blocking the room lock.
	sendQueue = 64

	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	maxMessage = 256 * 1024
)

// Peer is one participant's full server-side state: the signaling socket plus
// the publisher and subscriber PeerConnections.
type Peer struct {
	ID          string
	UserID      string
	Name        string
	AvatarColor string
	IsHost      bool
	JoinedAt    time.Time

	log  *slog.Logger
	conn *websocket.Conn

	publisher  *webrtc.PeerConnection
	subscriber *webrtc.PeerConnection

	// send serialises every socket write through one goroutine. Writing to a
	// gorilla/websocket connection from multiple goroutines corrupts the frame
	// stream; the previous relay did exactly that.
	send chan Message

	ctx    context.Context
	cancel context.CancelFunc

	mu    sync.RWMutex
	state PeerState

	// trackSources maps MediaStreamTrack.id -> declared source, populated from
	// each publisher offer before the description is applied.
	srcMu        sync.RWMutex
	trackSources map[string]TrackSource

	// Candidates can arrive before the matching SDP has been applied. Pion
	// rejects AddICECandidate while the remote description is nil, so they are
	// held here and flushed once it is set.
	candMu       sync.Mutex
	pubPending   []webrtc.ICECandidateInit
	subPending   []webrtc.ICECandidateInit
	pubRemoteSet bool
	subRemoteSet bool

	// Subscriber renegotiation must never overlap: starting a second offer
	// while the first is unanswered leaves the connection wedged. negotiating
	// guards the in-flight offer and negotiateAgain records that the track set
	// changed while one was outstanding.
	negMu          sync.Mutex
	negotiating    bool
	negotiateAgain bool

	closeOnce sync.Once
}

func (p *Peer) State() PeerState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

func (p *Peer) SetState(s PeerState) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.state = s
}

func (p *Peer) Participant() Participant {
	return Participant{
		PeerID:      p.ID,
		UserID:      p.UserID,
		Name:        p.Name,
		AvatarColor: p.AvatarColor,
		IsHost:      p.IsHost,
		JoinedAt:    p.JoinedAt,
		State:       p.State(),
	}
}

// Send queues a message for delivery. It never blocks: if a peer's queue is
// full the peer is too slow or wedged, and is disconnected rather than allowed
// to stall the whole room.
func (p *Peer) Send(typ string, payload any) {
	msg, err := newMessage(typ, payload)
	if err != nil {
		p.log.Error("marshal outbound message", "type", typ, "error", err)
		return
	}

	select {
	case p.send <- msg:
	case <-p.ctx.Done():
	default:
		p.log.Warn("send queue full, dropping peer", "peer", p.ID)
		p.Close()
	}
}

func (p *Peer) SendError(code, message string, fatal bool) {
	p.Send(TypeError, ErrorPayload{Code: code, Message: message, Fatal: fatal})
}

// writePump owns the socket's write side for the peer's lifetime.
func (p *Peer) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		p.Close()
	}()

	for {
		select {
		case <-p.ctx.Done():
			// Best-effort close frame so the browser reports a clean shutdown.
			_ = p.conn.SetWriteDeadline(time.Now().Add(time.Second))
			_ = p.conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return

		case msg := <-p.send:
			_ = p.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := p.conn.WriteJSON(msg); err != nil {
				p.log.Debug("socket write failed", "peer", p.ID, "error", err)
				return
			}

		case <-ticker.C:
			_ = p.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := p.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// addCandidate applies a trickled candidate, buffering it when the matching
// remote description has not been set yet.
func (p *Peer) addCandidate(target Target, cand webrtc.ICECandidateInit) error {
	p.candMu.Lock()
	defer p.candMu.Unlock()

	switch target {
	case TargetPublisher:
		if !p.pubRemoteSet {
			p.pubPending = append(p.pubPending, cand)
			return nil
		}
		return p.publisher.AddICECandidate(cand)
	case TargetSubscriber:
		if !p.subRemoteSet {
			p.subPending = append(p.subPending, cand)
			return nil
		}
		return p.subscriber.AddICECandidate(cand)
	default:
		return errors.New("unknown trickle target")
	}
}

// flushCandidates drains buffered candidates after a remote description lands.
func (p *Peer) flushCandidates(target Target) {
	p.candMu.Lock()
	defer p.candMu.Unlock()

	switch target {
	case TargetPublisher:
		p.pubRemoteSet = true
		for _, c := range p.pubPending {
			if err := p.publisher.AddICECandidate(c); err != nil {
				p.log.Debug("flush publisher candidate", "error", err)
			}
		}
		p.pubPending = nil
	case TargetSubscriber:
		p.subRemoteSet = true
		for _, c := range p.subPending {
			if err := p.subscriber.AddICECandidate(c); err != nil {
				p.log.Debug("flush subscriber candidate", "error", err)
			}
		}
		p.subPending = nil
	}
}

// HandlePublisherOffer answers the client's offer. The server is always the
// answerer here, so this path can never collide with another negotiation.
// SourceFor resolves a published track's declared source.
func (p *Peer) SourceFor(trackID string, kind webrtc.RTPCodecType) TrackSource {
	p.srcMu.RLock()
	src := p.trackSources[trackID]
	p.srcMu.RUnlock()
	return ParseSource(src, kind)
}

func (p *Peer) recordSources(sources map[string]TrackSource) {
	if len(sources) == 0 {
		return
	}
	p.srcMu.Lock()
	defer p.srcMu.Unlock()
	if p.trackSources == nil {
		p.trackSources = make(map[string]TrackSource, len(sources))
	}
	for id, src := range sources {
		p.trackSources[id] = src
	}
}

func (p *Peer) HandlePublisherOffer(sdp webrtc.SessionDescription) error {
	if err := p.publisher.SetRemoteDescription(sdp); err != nil {
		return err
	}
	p.flushCandidates(TargetPublisher)

	answer, err := p.publisher.CreateAnswer(nil)
	if err != nil {
		return err
	}
	if err := p.publisher.SetLocalDescription(answer); err != nil {
		return err
	}

	p.Send(TypePublisherAnswer, SDPPayload{SDP: answer})
	return nil
}

// HandleSubscriberAnswer completes a server-initiated offer and immediately
// starts another round if the track set changed while this one was in flight.
func (p *Peer) HandleSubscriberAnswer(sdp webrtc.SessionDescription) error {
	if err := p.subscriber.SetRemoteDescription(sdp); err != nil {
		return err
	}
	p.flushCandidates(TargetSubscriber)

	p.negMu.Lock()
	p.negotiating = false
	again := p.negotiateAgain
	p.negotiateAgain = false
	p.negMu.Unlock()

	if again {
		p.Negotiate()
	}
	return nil
}

// Negotiate offers the current subscriber track set to the client. Concurrent
// calls collapse into a single trailing renegotiation.
func (p *Peer) Negotiate() {
	if p.ctx.Err() != nil {
		return
	}

	p.negMu.Lock()
	if p.negotiating {
		// An offer is already outstanding. Record that another is needed and
		// let HandleSubscriberAnswer trigger it.
		p.negotiateAgain = true
		p.negMu.Unlock()
		return
	}
	p.negotiating = true
	p.negMu.Unlock()

	offer, err := p.subscriber.CreateOffer(nil)
	if err != nil {
		p.log.Error("create subscriber offer", "peer", p.ID, "error", err)
		p.clearNegotiating()
		return
	}
	if err := p.subscriber.SetLocalDescription(offer); err != nil {
		p.log.Error("set subscriber local description", "peer", p.ID, "error", err)
		p.clearNegotiating()
		return
	}

	p.Send(TypeSubscriberOffer, SDPPayload{SDP: offer})
}

func (p *Peer) clearNegotiating() {
	p.negMu.Lock()
	p.negotiating = false
	p.negMu.Unlock()
}

// Close tears the peer down exactly once and unblocks every goroutine that
// holds a reference to it.
func (p *Peer) Close() {
	p.closeOnce.Do(func() {
		p.cancel()
		if p.publisher != nil {
			_ = p.publisher.Close()
		}
		if p.subscriber != nil {
			_ = p.subscriber.Close()
		}
		_ = p.conn.Close()
	})
}

func (p *Peer) Done() <-chan struct{} { return p.ctx.Done() }

// decodePayload unmarshals a message payload into dst.
func decodePayload(raw json.RawMessage, dst any) error {
	if len(raw) == 0 {
		return errors.New("missing payload")
	}
	return json.Unmarshal(raw, dst)
}

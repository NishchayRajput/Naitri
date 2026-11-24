package sfu

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

// testClient is a minimal Go implementation of the browser side of the
// protocol: it always offers on the publisher connection and always answers on
// the subscriber connection.
type testClient struct {
	t    *testing.T
	conn *websocket.Conn

	pub *webrtc.PeerConnection
	sub *webrtc.PeerConnection

	mu      sync.Mutex
	sources map[string]TrackSource

	welcome  chan WelcomePayload
	remote   chan *webrtc.TrackRemote
	chatMsgs chan ChatMessage
	peerLeft chan string
	errs     chan ErrorPayload
	board    chan Message

	writeMu sync.Mutex
	closed  chan struct{}
}

func dialClient(t *testing.T, url string) *testClient {
	t.Helper()

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	api := webrtc.NewAPI()
	pub, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	sub, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("new subscriber: %v", err)
	}

	c := &testClient{
		t:        t,
		conn:     conn,
		pub:      pub,
		sub:      sub,
		sources:  make(map[string]TrackSource),
		welcome:  make(chan WelcomePayload, 1),
		remote:   make(chan *webrtc.TrackRemote, 8),
		chatMsgs: make(chan ChatMessage, 8),
		peerLeft: make(chan string, 8),
		errs:     make(chan ErrorPayload, 64),
		board:    make(chan Message, 256),
		closed:   make(chan struct{}),
	}

	pub.OnICECandidate(func(cand *webrtc.ICECandidate) {
		if cand == nil {
			return
		}
		init := cand.ToJSON()
		c.send(TypeTrickle, TricklePayload{Target: TargetPublisher, Candidate: &init})
	})
	sub.OnICECandidate(func(cand *webrtc.ICECandidate) {
		if cand == nil {
			return
		}
		init := cand.ToJSON()
		c.send(TypeTrickle, TricklePayload{Target: TargetSubscriber, Candidate: &init})
	})
	sub.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		select {
		case c.remote <- track:
		default:
		}
	})

	go c.readLoop()
	return c
}

func (c *testClient) send(typ string, payload any) {
	msg, err := newMessage(typ, payload)
	if err != nil {
		return
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.WriteJSON(msg)
}

func (c *testClient) readLoop() {
	defer close(c.closed)

	for {
		var msg Message
		if err := c.conn.ReadJSON(&msg); err != nil {
			return
		}

		switch msg.Type {
		case TypeWelcome:
			var p WelcomePayload
			if json.Unmarshal(msg.Payload, &p) == nil {
				select {
				case c.welcome <- p:
				default:
				}
			}

		case TypePublisherAnswer:
			var p SDPPayload
			if json.Unmarshal(msg.Payload, &p) == nil {
				_ = c.pub.SetRemoteDescription(p.SDP)
			}

		case TypeSubscriberOffer:
			var p SDPPayload
			if json.Unmarshal(msg.Payload, &p) != nil {
				continue
			}
			if err := c.sub.SetRemoteDescription(p.SDP); err != nil {
				continue
			}
			answer, err := c.sub.CreateAnswer(nil)
			if err != nil {
				continue
			}
			if err := c.sub.SetLocalDescription(answer); err != nil {
				continue
			}
			c.send(TypeSubscriberAnswer, SDPPayload{SDP: answer})

		case TypeTrickle:
			var p TricklePayload
			if json.Unmarshal(msg.Payload, &p) != nil || p.Candidate == nil {
				continue
			}
			if p.Target == TargetPublisher {
				_ = c.pub.AddICECandidate(*p.Candidate)
			} else {
				_ = c.sub.AddICECandidate(*p.Candidate)
			}

		case TypeChat:
			var p ChatMessage
			if json.Unmarshal(msg.Payload, &p) == nil {
				select {
				case c.chatMsgs <- p:
				default:
				}
			}

		case TypeError, TypeRemoved:
			var p ErrorPayload
			if json.Unmarshal(msg.Payload, &p) == nil {
				select {
				case c.errs <- p:
				default:
				}
			}

		case TypeBoardState, TypeBoardStroke, TypeBoardErase, TypeBoardClear, TypeBoardCursor:
			select {
			case c.board <- msg:
			default:
			}

		case TypePeerLeft:
			var p PeerLeftPayload
			if json.Unmarshal(msg.Payload, &p) == nil {
				select {
				case c.peerLeft <- p.PeerID:
				default:
				}
			}
		}
	}
}

// publish adds a track and drives one publisher negotiation round.
func (c *testClient) publish(track *webrtc.TrackLocalStaticRTP, source TrackSource) {
	c.t.Helper()

	if _, err := c.pub.AddTrack(track); err != nil {
		c.t.Fatalf("add track: %v", err)
	}

	c.mu.Lock()
	c.sources[track.ID()] = source
	sources := make(map[string]TrackSource, len(c.sources))
	for k, v := range c.sources {
		sources[k] = v
	}
	c.mu.Unlock()

	offer, err := c.pub.CreateOffer(nil)
	if err != nil {
		c.t.Fatalf("create offer: %v", err)
	}
	if err := c.pub.SetLocalDescription(offer); err != nil {
		c.t.Fatalf("set local description: %v", err)
	}
	c.send(TypePublisherOffer, SDPPayload{SDP: offer, Tracks: sources})
}

func (c *testClient) close() {
	_ = c.conn.Close()
	_ = c.pub.Close()
	_ = c.sub.Close()
}

// newTestServer wires the SFU behind a bare WebSocket endpoint, isolating the
// media path from auth and persistence.
func newTestServer(t *testing.T, maxRoomSize int) (*httptest.Server, *Manager) {
	t.Helper()

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	manager, err := NewManager(Options{MaxRoomSize: maxRoomSize}, log)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		room := manager.GetOrCreateRoom("test-room", RoomInfo{Code: "test-room", Name: "Test"})
		manager.Join(conn, room, Identity{
			UserID: r.URL.Query().Get("user"),
			Name:   r.URL.Query().Get("user"),
			IsHost: r.URL.Query().Get("host") == "1",
		})
	}))

	t.Cleanup(srv.Close)
	return srv, manager
}

func wsURL(srv *httptest.Server, query string) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http") + "/?" + query
}

// sendRTP pushes synthetic packets until the context is cancelled, so the
// forwarding path has something real to carry.
func sendRTP(ctx context.Context, track *webrtc.TrackLocalStaticRTP) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	payload := make([]byte, 120)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = track.WriteRTP(newRTPPacket(payload))
		}
	}
}

// TestTrackIsForwardedBetweenPeers is the core assertion: media published by
// one peer must reach another peer's subscriber connection.
func TestTrackIsForwardedBetweenPeers(t *testing.T) {
	srv, _ := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice&host=1"))
	defer alice.close()
	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()

	waitWelcome(t, alice)
	waitWelcome(t, bob)

	track, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
		"alice-video", "alice-stream",
	)
	if err != nil {
		t.Fatalf("new track: %v", err)
	}

	alice.publish(track, SourceCamera)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go sendRTP(ctx, track)

	select {
	case remote := <-bob.remote:
		if remote.Kind() != webrtc.RTPCodecTypeVideo {
			t.Fatalf("expected video track, got %s", remote.Kind())
		}
		// The stream id must carry alice's peer id and the declared source, so
		// bob's UI can attribute the tile without a second lookup.
		if !strings.HasSuffix(remote.StreamID(), ":"+string(SourceCamera)) {
			t.Fatalf("stream id %q does not encode the source", remote.StreamID())
		}

		// Prove the forwarding loop actually carries payload, not just SDP.
		_ = remote.SetReadDeadline(time.Now().Add(10 * time.Second))
		if _, _, err := remote.ReadRTP(); err != nil {
			t.Fatalf("read forwarded rtp: %v", err)
		}

	case <-time.After(20 * time.Second):
		t.Fatal("bob never received alice's track")
	}
}

// TestLateJoinerReceivesExistingTracks covers the subscribe-to-existing path:
// someone who joins after a track is published must still receive it.
func TestLateJoinerReceivesExistingTracks(t *testing.T) {
	srv, _ := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice&host=1"))
	defer alice.close()
	waitWelcome(t, alice)

	track, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
		"alice-video", "alice-stream",
	)
	if err != nil {
		t.Fatalf("new track: %v", err)
	}
	alice.publish(track, SourceScreen)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go sendRTP(ctx, track)

	// Give the publish a moment to register before the late joiner connects.
	time.Sleep(500 * time.Millisecond)

	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()
	waitWelcome(t, bob)

	select {
	case remote := <-bob.remote:
		if !strings.HasSuffix(remote.StreamID(), ":"+string(SourceScreen)) {
			t.Fatalf("expected screen source, got stream id %q", remote.StreamID())
		}
	case <-time.After(20 * time.Second):
		t.Fatal("late joiner never received the existing track")
	}
}

func TestRoomFullIsRejected(t *testing.T) {
	srv, manager := newTestServer(t, 1)

	alice := dialClient(t, wsURL(srv, "user=alice"))
	defer alice.close()
	waitWelcome(t, alice)

	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()

	// Bob is refused, so his socket closes without a welcome.
	select {
	case <-bob.welcome:
		t.Fatal("second peer was admitted to a room with capacity 1")
	case <-bob.closed:
	case <-time.After(5 * time.Second):
		t.Fatal("rejected peer's socket was never closed")
	}

	if got := manager.Room("test-room").Size(); got != 1 {
		t.Fatalf("room size = %d, want 1", got)
	}
}

func TestChatIsBroadcastToEveryone(t *testing.T) {
	srv, _ := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice"))
	defer alice.close()
	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()

	waitWelcome(t, alice)
	waitWelcome(t, bob)

	alice.send(TypeChat, ChatPayload{Text: "  hello room  "})

	// The sender is echoed too, so ordering is server-authoritative.
	for _, c := range []*testClient{alice, bob} {
		select {
		case msg := <-c.chatMsgs:
			if msg.Text != "hello room" {
				t.Fatalf("chat text = %q, want %q (should be trimmed)", msg.Text, "hello room")
			}
		case <-time.After(5 * time.Second):
			t.Fatal("chat message was not delivered")
		}
	}
}

func TestPeerLeaveIsAnnounced(t *testing.T) {
	srv, manager := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice"))
	defer alice.close()
	bob := dialClient(t, wsURL(srv, "user=bob"))

	waitWelcome(t, alice)
	bobWelcome := waitWelcome(t, bob)

	bob.close()

	select {
	case left := <-alice.peerLeft:
		if left != bobWelcome.Self.PeerID {
			t.Fatalf("peer-left reported %q, want %q", left, bobWelcome.Self.PeerID)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("remaining peer was never told about the departure")
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if manager.Room("test-room").Size() == 1 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("room size never dropped after the peer left")
}

func waitWelcome(t *testing.T, c *testClient) WelcomePayload {
	t.Helper()
	select {
	case w := <-c.welcome:
		return w
	case <-time.After(10 * time.Second):
		t.Fatal("never received welcome")
		return WelcomePayload{}
	}
}

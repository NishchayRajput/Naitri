package sfu

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestTURNCredentialsAreTimeLimitedHMAC(t *testing.T) {
	expires := time.Unix(1_900_000_000, 0)
	user, pass := TURNCredentials("s3cret", "user-1", expires)

	if user != "1900000000:user-1" {
		t.Fatalf("username = %q, want expiry-prefixed user id", user)
	}
	mac := hmac.New(sha1.New, []byte("s3cret"))
	mac.Write([]byte(user))
	if want := base64.StdEncoding.EncodeToString(mac.Sum(nil)); pass != want {
		t.Fatalf("credential = %q, want %q", pass, want)
	}
}

func TestICEServersNeverExposeStaticPasswordWhenSecretSet(t *testing.T) {
	m, err := NewManager(Options{
		MaxRoomSize: 2,
		TURNURL:     "turn:turn.example.com:3478",
		TURNUser:    "static-user",
		TURNPass:    "static-pass",
		TURNSecret:  "s3cret",
		TURNCredTTL: time.Hour,
	}, testLogger())
	if err != nil {
		t.Fatal(err)
	}

	var turn *webrtc.ICEServer
	for _, s := range m.ICEServersFor("user-1") {
		if s.Credential == "static-pass" || s.Username == "static-user" {
			t.Fatal("static TURN credentials were handed to a client")
		}
		if len(s.URLs) > 0 && strings.HasPrefix(s.URLs[0], "turn:") {
			turn = &s
		}
	}
	if turn == nil || !strings.HasSuffix(turn.Username, ":user-1") {
		t.Fatalf("expected a per-user TURN entry, got %+v", turn)
	}
}

func TestPendingCandidatesAreBounded(t *testing.T) {
	p := &Peer{}
	for i := 0; i < maxPendingCandidates; i++ {
		if err := p.addCandidate(TargetPublisher, webrtc.ICECandidateInit{Candidate: "x"}); err != nil {
			t.Fatalf("candidate %d rejected early: %v", i, err)
		}
	}
	if err := p.addCandidate(TargetPublisher, webrtc.ICECandidateInit{Candidate: "x"}); err == nil {
		t.Fatal("pending candidate buffer grew past its cap")
	}
}

func TestTrackSourcesAreReplacedAndBounded(t *testing.T) {
	p := &Peer{trackSources: map[string]TrackSource{}}

	_ = p.recordSources(map[string]TrackSource{"a": SourceCamera})
	_ = p.recordSources(map[string]TrackSource{"b": SourceScreen})
	if len(p.trackSources) != 1 {
		t.Fatalf("source map has %d entries, want 1 (replaced, not merged)", len(p.trackSources))
	}

	huge := make(map[string]TrackSource, maxTrackSources+1)
	for i := 0; i <= maxTrackSources; i++ {
		huge[strings.Repeat("x", i+1)] = SourceCamera
	}
	if err := p.recordSources(huge); err == nil {
		t.Fatal("oversized source map was accepted")
	}
}

// One participant flooding chat must get themselves disconnected without
// knocking anyone else out of the room.
func TestChatFloodDisconnectsOnlyTheFlooder(t *testing.T) {
	srv, manager := newTestServer(t, 10)

	attacker := dialClient(t, wsURL(srv, "user=mallory"))
	defer attacker.close()
	victim := dialClient(t, wsURL(srv, "user=bob"))
	defer victim.close()

	waitWelcome(t, attacker)
	waitWelcome(t, victim)

	for i := 0; i < 2000; i++ {
		attacker.send(TypeChat, ChatPayload{Text: "spam"})
	}

	select {
	case <-attacker.closed:
	case <-time.After(5 * time.Second):
		t.Fatal("flooding client was never disconnected")
	}

	// Rate limiting caps what reached the room: the chat burst, not 2000.
	delivered := 0
drain:
	for {
		select {
		case <-victim.chatMsgs:
			delivered++
		case <-time.After(300 * time.Millisecond):
			break drain
		}
	}
	if delivered > 12 {
		t.Fatalf("victim received %d chat messages; rate limit did not hold", delivered)
	}

	select {
	case <-victim.closed:
		t.Fatal("bystander was disconnected by someone else's flood")
	default:
	}
	waitForSize(t, manager, 1)
}

func TestRemovedUserCannotRejoin(t *testing.T) {
	srv, manager := newTestServer(t, 10)

	host := dialClient(t, wsURL(srv, "user=hostuser&host=1"))
	defer host.close()
	waitWelcome(t, host)

	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()
	bobWelcome := waitWelcome(t, bob)

	host.send(TypeRemovePeer, RemovePeerPayload{PeerID: bobWelcome.Self.PeerID})

	select {
	case e := <-bob.errs:
		if e.Code != "removed_by_host" || !e.Fatal {
			t.Fatalf("removed peer got %+v", e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("removed peer was never told")
	}
	waitForSize(t, manager, 1)

	again := dialClient(t, wsURL(srv, "user=bob"))
	defer again.close()
	select {
	case e := <-again.errs:
		if e.Code != "removed_by_host" {
			t.Fatalf("rejoin error = %q, want removed_by_host", e.Code)
		}
	case <-again.welcome:
		t.Fatal("banned user was allowed back in")
	case <-time.After(5 * time.Second):
		t.Fatal("rejoin attempt got no response")
	}
	waitForSize(t, manager, 1)
}

func TestHostCannotBeRemoved(t *testing.T) {
	srv, manager := newTestServer(t, 10)

	host := dialClient(t, wsURL(srv, "user=hostuser&host=1"))
	defer host.close()
	waitWelcome(t, host)
	// Same user in a second tab, also host.
	tab := dialClient(t, wsURL(srv, "user=hostuser&host=1"))
	defer tab.close()
	tabWelcome := waitWelcome(t, tab)

	host.send(TypeRemovePeer, RemovePeerPayload{PeerID: tabWelcome.Self.PeerID})
	time.Sleep(500 * time.Millisecond)

	if manager.Room("test-room").IsBanned("hostuser") {
		t.Fatal("host banned themselves")
	}
	waitForSize(t, manager, 2)
}

func waitForSize(t *testing.T, m *Manager, want int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if r := m.Room("test-room"); r != nil && r.Size() == want {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	got := -1
	if r := m.Room("test-room"); r != nil {
		got = r.Size()
	}
	t.Fatalf("room size = %d, want %d", got, want)
}

func testLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

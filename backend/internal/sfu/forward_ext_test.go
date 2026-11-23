package sfu

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

// Header extension IDs are negotiated per connection. The publisher's IDs mean
// nothing — or something different — on each subscriber's connection, so
// forwarding them verbatim corrupts the packet for the receiver. The concrete
// failure was the MID extension: a browser demuxes by MID, so a forwarded
// video packet carrying the publisher's MID landed on the subscriber's audio
// transceiver and was silently dropped. Whoever joined first never saw later
// joiners' video.
func TestForwardedPacketsDropPublisherHeaderExtensions(t *testing.T) {
	srv, _ := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice&host=1"))
	defer alice.close()
	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()
	waitWelcome(t, alice)
	waitWelcome(t, bob)

	track, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8}, "alice-video", "alice-stream",
	)
	if err != nil {
		t.Fatal(err)
	}
	alice.publish(track, SourceCamera)

	marker := []byte{0xAB, 0xCD, 0xEF}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p := newRTPPacket(make([]byte, 120))
				// Stands in for the publisher's MID: an extension whose ID is
				// only meaningful on the publisher's own connection.
				_ = p.Header.SetExtension(5, marker)
				_ = track.WriteRTP(p)
			}
		}
	}()

	select {
	case remote := <-bob.remote:
		for i := 0; i < 10; i++ {
			_ = remote.SetReadDeadline(time.Now().Add(10 * time.Second))
			pkt, _, err := remote.ReadRTP()
			if err != nil {
				t.Fatalf("read forwarded rtp: %v", err)
			}
			for _, id := range pkt.Header.GetExtensionIDs() {
				if bytes.Equal(pkt.Header.GetExtension(id), marker) {
					t.Fatalf("publisher's header extension (id %d) was forwarded to the subscriber", id)
				}
			}
		}
	case <-time.After(20 * time.Second):
		t.Fatal("bob never received alice's track")
	}
}

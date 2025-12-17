package sfu

import (
	"context"
	"io"
	"log"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

type Room struct {
	ID string

	mu     sync.RWMutex
	Peers  map[string]*Peer
	Tracks map[string]*webrtc.TrackLocalStaticRTP
}

func NewRoom(id string) *Room {
	return &Room{
		ID:     id,
		Peers:  make(map[string]*Peer),
		Tracks: make(map[string]*webrtc.TrackLocalStaticRTP),
	}
}

func (r *Room) AddPeer(p *Peer) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Peers[p.ID] = p
}

func (r *Room) RemovePeer(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p, ok := r.Peers[id]; ok {
		p.PC.Close()
		delete(r.Peers, id)
	}
}

func (r *Room) AddTrack(remote *webrtc.TrackRemote) *webrtc.TrackLocalStaticRTP {
	r.mu.Lock()
	defer r.mu.Unlock()

	trackLocal, _ := webrtc.NewTrackLocalStaticRTP(
		remote.Codec().RTPCodecCapability,
		remote.ID(),
		"sfu",
	)

	r.Tracks[remote.ID()] = trackLocal
	return trackLocal
}

func (r *Room) RemoveTrack(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Tracks, id)
}

func (r *Room) FanOut(ctx context.Context, remote *webrtc.TrackRemote, local *webrtc.TrackLocalStaticRTP) {
	buf := make([]byte, 1500)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			n, _, err := remote.Read(buf)
			if err != nil {
				if err == io.EOF {
					return
				}
				time.Sleep(10 * time.Millisecond)
				continue
			}
			if _, err := local.Write(buf[:n]); err != nil {
				log.Println("write RTP error:", err)
				return
			}
		}
	}
}

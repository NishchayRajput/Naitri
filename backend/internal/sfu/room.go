package sfu

import (
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

// keyframeInterval bounds how long a newly subscribed client stares at a blank
// tile: the SFU forwards an existing stream mid-GOP, so it asks the publisher
// for a fresh keyframe on this cadence.
const keyframeInterval = 2 * time.Second

// publishedTrack is one media track being fanned out to the room.
type publishedTrack struct {
	info   TrackInfo
	local  *webrtc.TrackLocalStaticRTP
	remote *webrtc.TrackRemote
	owner  *Peer
}

// Room holds the live media topology for one meeting code. It is independent
// of the persisted model.Room, which only stores metadata.
type Room struct {
	Code string
	Info RoomInfo

	log *slog.Logger

	mu     sync.RWMutex
	peers  map[string]*Peer
	tracks map[string]*publishedTrack
	// subs[peerID][trackID] is the sender delivering that track to that peer,
	// kept so a track can be detached on unpublish.
	subs map[string]map[string]*webrtc.RTPSender

	// banned holds user IDs the host removed. Joins are also checked against
	// the persisted list; this copy closes the race with in-flight joins.
	banned map[string]struct{}

	maxSize int
	onEmpty func(code string)
}

func NewRoom(code string, info RoomInfo, maxSize int, log *slog.Logger, onEmpty func(string)) *Room {
	return &Room{
		Code:    code,
		Info:    info,
		log:     log.With("room", code),
		peers:   make(map[string]*Peer),
		tracks:  make(map[string]*publishedTrack),
		subs:    make(map[string]map[string]*webrtc.RTPSender),
		banned:  make(map[string]struct{}),
		maxSize: maxSize,
		onEmpty: onEmpty,
	}
}

var (
	ErrRoomFull = errors.New("room is full")
	ErrBanned   = errors.New("user was removed from this room")
)

// Ban records a user as removed and returns every connection they currently
// hold in the room (they may have several tabs open).
func (r *Room) Ban(userID string) []*Peer {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.banned[userID] = struct{}{}
	var out []*Peer
	for _, p := range r.peers {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out
}

func (r *Room) IsBanned(userID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.banned[userID]
	return ok
}

func (r *Room) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.peers)
}

func (r *Room) Peer(id string) *Peer {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.peers[id]
}

func (r *Room) Participants() []Participant {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]Participant, 0, len(r.peers))
	for _, p := range r.peers {
		out = append(out, p.Participant())
	}
	return out
}

func (r *Room) TrackInfos() []TrackInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]TrackInfo, 0, len(r.tracks))
	for _, t := range r.tracks {
		out = append(out, t.info)
	}
	return out
}

// AddPeer registers a peer and returns the state it needs for its welcome.
func (r *Room) AddPeer(p *Peer) error {
	r.mu.Lock()
	if _, banned := r.banned[p.UserID]; banned && !p.IsHost {
		r.mu.Unlock()
		return ErrBanned
	}
	if len(r.peers) >= r.maxSize {
		r.mu.Unlock()
		return ErrRoomFull
	}
	r.peers[p.ID] = p
	r.subs[p.ID] = make(map[string]*webrtc.RTPSender)
	r.mu.Unlock()

	r.Broadcast(TypePeerJoined, p.Participant(), p.ID)
	r.log.Info("peer joined", "peer", p.ID, "name", p.Name, "size", r.Size())
	return nil
}

// RemovePeer detaches a peer, drops every track it published, and renegotiates
// everyone who was subscribed to those tracks.
func (r *Room) RemovePeer(peerID string) {
	r.mu.Lock()
	peer, ok := r.peers[peerID]
	if !ok {
		r.mu.Unlock()
		return
	}
	delete(r.peers, peerID)
	delete(r.subs, peerID)

	// Collect this peer's tracks, then detach them from every remaining peer.
	var gone []TrackInfo
	for trackID, t := range r.tracks {
		if t.owner.ID != peerID {
			continue
		}
		gone = append(gone, t.info)
		delete(r.tracks, trackID)

		for otherID, senders := range r.subs {
			sender, ok := senders[trackID]
			if !ok {
				continue
			}
			if other := r.peers[otherID]; other != nil {
				if err := other.subscriber.RemoveTrack(sender); err != nil {
					r.log.Debug("remove track from subscriber", "peer", otherID, "error", err)
				}
			}
			delete(senders, trackID)
		}
	}

	// Snapshot the remaining peers so renegotiation happens outside the lock.
	remaining := make([]*Peer, 0, len(r.peers))
	for _, p := range r.peers {
		remaining = append(remaining, p)
	}
	empty := len(r.peers) == 0
	r.mu.Unlock()

	peer.Close()

	for _, info := range gone {
		r.Broadcast(TypeTrackUnpublished, info, "")
	}
	r.Broadcast(TypePeerLeft, PeerLeftPayload{PeerID: peerID}, "")

	if len(gone) > 0 {
		for _, p := range remaining {
			p.Negotiate()
		}
	}

	r.log.Info("peer left", "peer", peerID, "size", len(remaining))

	if empty && r.onEmpty != nil {
		r.onEmpty(r.Code)
	}
}

// PublishTrack takes a track arriving on a peer's publisher connection, makes
// a forwardable copy, attaches it to every other peer, and pumps RTP into it.
func (r *Room) PublishTrack(owner *Peer, remote *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
	source := owner.SourceFor(remote.ID(), remote.Kind())

	// Namespacing by peer keeps ids unique across the room, and encoding the
	// source into the outgoing stream id lets the client group tiles without a
	// separate lookup message.
	trackID := owner.ID + "/" + remote.ID()
	streamID := owner.ID + ":" + string(source)

	local, err := webrtc.NewTrackLocalStaticRTP(remote.Codec().RTPCodecCapability, trackID, streamID)
	if err != nil {
		r.log.Error("create local track", "peer", owner.ID, "error", err)
		return
	}

	pt := &publishedTrack{
		info: TrackInfo{
			PeerID:   owner.ID,
			TrackID:  trackID,
			StreamID: streamID,
			Kind:     remote.Kind().String(),
			Source:   source,
		},
		local:  local,
		remote: remote,
		owner:  owner,
	}

	r.mu.Lock()
	owned := 0
	for _, t := range r.tracks {
		if t.owner.ID == owner.ID {
			owned++
		}
	}
	if owned >= maxPublishedTracks {
		r.mu.Unlock()
		r.log.Warn("peer exceeded published track limit; ignoring track",
			"peer", owner.ID, "limit", maxPublishedTracks)
		_ = receiver.Stop()
		return
	}
	r.tracks[trackID] = pt
	targets := make([]*Peer, 0, len(r.peers))
	for id, p := range r.peers {
		if id == owner.ID {
			continue
		}
		if err := r.attachLocked(p, pt); err != nil {
			r.log.Error("attach track", "peer", id, "track", trackID, "error", err)
			continue
		}
		targets = append(targets, p)
	}
	r.mu.Unlock()

	r.Broadcast(TypeTrackPublished, pt.info, owner.ID)
	for _, p := range targets {
		p.Negotiate()
	}

	r.log.Info("track published",
		"peer", owner.ID, "track", trackID, "kind", pt.info.Kind, "source", source)

	if remote.Kind() == webrtc.RTPCodecTypeVideo {
		go r.requestKeyframes(owner, remote)
	}

	r.forwardRTP(pt)
}

// attachLocked adds a track to one subscriber. Callers must hold r.mu.
func (r *Room) attachLocked(p *Peer, pt *publishedTrack) error {
	if _, already := r.subs[p.ID][pt.info.TrackID]; already {
		return nil
	}

	sender, err := p.subscriber.AddTrack(pt.local)
	if err != nil {
		return err
	}
	r.subs[p.ID][pt.info.TrackID] = sender

	// Receiver reports must be drained or the interceptor chain's buffers fill
	// up and stall; this also ends cleanly when the sender is removed.
	go func() {
		buf := make([]byte, 1500)
		for {
			if _, _, err := sender.Read(buf); err != nil {
				return
			}
		}
	}()

	return nil
}

// SubscribeToExisting attaches every track already live in the room to a peer
// that has just joined.
func (r *Room) SubscribeToExisting(p *Peer) {
	r.mu.Lock()
	attached := 0
	for _, pt := range r.tracks {
		if pt.owner.ID == p.ID {
			continue
		}
		if err := r.attachLocked(p, pt); err != nil {
			r.log.Error("attach existing track", "peer", p.ID, "error", err)
			continue
		}
		attached++
	}
	r.mu.Unlock()

	if attached > 0 {
		p.Negotiate()
	}
}

// forwardRTP is the fan-out loop. It blocks until the publisher stops sending,
// then unpublishes the track.
func (r *Room) forwardRTP(pt *publishedTrack) {
	defer r.unpublishTrack(pt)

	for {
		packet, _, err := pt.remote.ReadRTP()
		if err != nil {
			if !errors.Is(err, io.EOF) && pt.owner.ctx.Err() == nil {
				r.log.Debug("read rtp", "track", pt.info.TrackID, "error", err)
			}
			return
		}

		// WriteRTP rewrites SSRC and payload type per subscriber binding, so a
		// single call serves every attached sender. io.ErrClosedPipe means the
		// track has no bindings right now, which is normal and not fatal.
		if err := pt.local.WriteRTP(packet); err != nil && !errors.Is(err, io.ErrClosedPipe) {
			r.log.Debug("write rtp", "track", pt.info.TrackID, "error", err)
			return
		}
	}
}

func (r *Room) unpublishTrack(pt *publishedTrack) {
	r.mu.Lock()
	if _, ok := r.tracks[pt.info.TrackID]; !ok {
		r.mu.Unlock()
		return
	}
	delete(r.tracks, pt.info.TrackID)

	var affected []*Peer
	for peerID, senders := range r.subs {
		sender, ok := senders[pt.info.TrackID]
		if !ok {
			continue
		}
		if p := r.peers[peerID]; p != nil {
			if err := p.subscriber.RemoveTrack(sender); err != nil {
				r.log.Debug("detach track", "peer", peerID, "error", err)
			}
			affected = append(affected, p)
		}
		delete(senders, pt.info.TrackID)
	}
	r.mu.Unlock()

	r.Broadcast(TypeTrackUnpublished, pt.info, "")
	for _, p := range affected {
		p.Negotiate()
	}

	r.log.Info("track unpublished", "track", pt.info.TrackID)
}

// requestKeyframes periodically asks the publisher for an IDR frame so peers
// that subscribe mid-stream render quickly instead of waiting for the next
// natural keyframe.
func (r *Room) requestKeyframes(owner *Peer, remote *webrtc.TrackRemote) {
	ticker := time.NewTicker(keyframeInterval)
	defer ticker.Stop()

	for {
		select {
		case <-owner.Done():
			return
		case <-ticker.C:
			r.mu.RLock()
			_, live := r.tracks[owner.ID+"/"+remote.ID()]
			r.mu.RUnlock()
			if !live {
				return
			}

			err := owner.publisher.WriteRTCP([]rtcp.Packet{
				&rtcp.PictureLossIndication{MediaSSRC: uint32(remote.SSRC())},
			})
			if err != nil {
				return
			}
		}
	}
}

// Broadcast delivers a message to every peer, optionally skipping one.
func (r *Room) Broadcast(typ string, payload any, exceptPeerID string) {
	r.mu.RLock()
	targets := make([]*Peer, 0, len(r.peers))
	for id, p := range r.peers {
		if id == exceptPeerID {
			continue
		}
		targets = append(targets, p)
	}
	r.mu.RUnlock()

	// Sent outside the lock: Send can call Close on a wedged peer, which would
	// otherwise re-enter the room and deadlock.
	for _, p := range targets {
		p.Send(typ, payload)
	}
}

// BroadcastLossy is Broadcast for messages a recipient can afford to miss;
// see Peer.SendLossy.
func (r *Room) BroadcastLossy(typ string, payload any, exceptPeerID string) {
	r.mu.RLock()
	targets := make([]*Peer, 0, len(r.peers))
	for id, p := range r.peers {
		if id == exceptPeerID {
			continue
		}
		targets = append(targets, p)
	}
	r.mu.RUnlock()

	for _, p := range targets {
		p.SendLossy(typ, payload)
	}
}

func (r *Room) SetLocked(locked bool) {
	r.mu.Lock()
	r.Info.Locked = locked
	r.mu.Unlock()
	r.Broadcast(TypeRoomLocked, LockPayload{Locked: locked}, "")
}

// HostPeer returns the peer flagged as the meeting host, if present.
func (r *Room) HostPeer() *Peer {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.peers {
		if p.IsHost {
			return p
		}
	}
	return nil
}

// sanitizeName trims a display name for safe rendering in the participant list.
func sanitizeName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "Guest"
	}
	if len([]rune(name)) > 48 {
		return string([]rune(name)[:48])
	}
	return name
}

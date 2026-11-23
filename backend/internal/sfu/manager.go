package sfu

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"
)

// Options configures the media engine and the ICE servers advertised to
// browsers.
type Options struct {
	STUNURLs    []string
	TURNURL     string
	TURNUser    string
	TURNPass    string
	TURNSecret  string
	TURNCredTTL time.Duration
	PublicIP    string
	MaxRoomSize int
}

// Manager owns every live room plus the shared WebRTC API object.
type Manager struct {
	log   *slog.Logger
	api   *webrtc.API
	opts  Options
	hooks Hooks

	iceServers []webrtc.ICEServer

	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewManager(opts Options, log *slog.Logger) (*Manager, error) {
	api, err := buildAPI(opts)
	if err != nil {
		return nil, err
	}

	if opts.TURNCredTTL <= 0 {
		opts.TURNCredTTL = 6 * time.Hour
	}

	// Static servers: STUN always, TURN only when it uses fixed credentials.
	// With a TURN secret, credentials are minted per peer in ICEServersFor.
	ice := []webrtc.ICEServer{}
	if len(opts.STUNURLs) > 0 {
		ice = append(ice, webrtc.ICEServer{URLs: opts.STUNURLs})
	}
	if opts.TURNURL != "" && opts.TURNSecret == "" {
		ice = append(ice, webrtc.ICEServer{
			URLs:       []string{opts.TURNURL},
			Username:   opts.TURNUser,
			Credential: opts.TURNPass,
		})
	}

	return &Manager{
		log:        log.With("component", "sfu"),
		api:        api,
		opts:       opts,
		iceServers: ice,
		rooms:      make(map[string]*Room),
	}, nil
}

// buildAPI assembles the media engine, interceptor chain and setting engine.
// A single shared API is correct and intended: it carries no per-connection
// state.
func buildAPI(opts Options) (*webrtc.API, error) {
	mediaEngine := &webrtc.MediaEngine{}
	if err := mediaEngine.RegisterDefaultCodecs(); err != nil {
		return nil, fmt.Errorf("register codecs: %w", err)
	}

	// Transport-wide congestion control and absolute send time let senders
	// adapt bitrate instead of blindly pushing into a congested path.
	for _, ext := range []string{
		"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
		"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
	} {
		if err := mediaEngine.RegisterHeaderExtension(
			webrtc.RTPHeaderExtensionCapability{URI: ext},
			webrtc.RTPCodecTypeVideo,
		); err != nil {
			return nil, fmt.Errorf("register video header extension %q: %w", ext, err)
		}
	}
	// Audio level lets the SFU (and future server-side speaker detection) see
	// who is talking without decoding the stream.
	if err := mediaEngine.RegisterHeaderExtension(
		webrtc.RTPHeaderExtensionCapability{URI: "urn:ietf:params:rtp-hdrext:ssrc-audio-level"},
		webrtc.RTPCodecTypeAudio,
	); err != nil {
		return nil, fmt.Errorf("register audio level extension: %w", err)
	}

	registry := &interceptor.Registry{}
	// Default interceptors give us NACK retransmission, RTCP reports and TWCC.
	if err := webrtc.RegisterDefaultInterceptors(mediaEngine, registry); err != nil {
		return nil, fmt.Errorf("register interceptors: %w", err)
	}

	settings := webrtc.SettingEngine{}
	if opts.PublicIP != "" {
		// Required when the SFU sits behind a 1:1 NAT (most cloud VMs):
		// without it the server advertises only its private address.
		settings.SetNAT1To1IPs([]string{opts.PublicIP}, webrtc.ICECandidateTypeHost)
	}

	return webrtc.NewAPI(
		webrtc.WithMediaEngine(mediaEngine),
		webrtc.WithInterceptorRegistry(registry),
		webrtc.WithSettingEngine(settings),
	), nil
}

func (m *Manager) ICEServers() []webrtc.ICEServer { return m.iceServers }

// ICEServersFor returns the ICE servers to hand one user. When a TURN secret
// is configured it mints credentials in the coturn "TURN REST API" format:
// username "<expiry-unix>:<userID>", password base64(HMAC-SHA1(secret,
// username)). They stop working at expiry, so a leaked credential cannot be
// used to relay traffic indefinitely.
func (m *Manager) ICEServersFor(userID string) []webrtc.ICEServer {
	if m.opts.TURNURL == "" || m.opts.TURNSecret == "" {
		return m.iceServers
	}
	username, credential := TURNCredentials(m.opts.TURNSecret, userID, time.Now().Add(m.opts.TURNCredTTL))

	out := make([]webrtc.ICEServer, 0, len(m.iceServers)+1)
	out = append(out, m.iceServers...)
	return append(out, webrtc.ICEServer{
		URLs:       []string{m.opts.TURNURL},
		Username:   username,
		Credential: credential,
	})
}

// TURNCredentials builds a time-limited TURN username and password.
func TURNCredentials(secret, userID string, expires time.Time) (username, credential string) {
	username = strconv.FormatInt(expires.Unix(), 10) + ":" + userID
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(username))
	return username, base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// GetOrCreateRoom returns the live room for a code, creating it on first join.
func (m *Manager) GetOrCreateRoom(code string, info RoomInfo) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[code]; ok {
		return r
	}

	r := NewRoom(code, info, m.opts.MaxRoomSize, m.log, m.removeRoom)
	m.rooms[code] = r
	return r
}

func (m *Manager) Room(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[code]
}

// removeRoom drops an empty room. It re-checks emptiness under the lock so a
// peer that joined between the callback and here is not discarded.
func (m *Manager) removeRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[code]; ok && r.Size() == 0 {
		delete(m.rooms, code)
		m.log.Info("room closed", "room", code)
	}
}

// Stats reports live room and participant counts for health checks.
func (m *Manager) Stats() (rooms int, participants int) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, r := range m.rooms {
		rooms++
		participants += r.Size()
	}
	return rooms, participants
}

// Shutdown closes every peer in every room.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	rooms := make([]*Room, 0, len(m.rooms))
	for _, r := range m.rooms {
		rooms = append(rooms, r)
	}
	m.rooms = make(map[string]*Room)
	m.mu.Unlock()

	for _, r := range rooms {
		for _, p := range r.snapshotPeers() {
			p.SendError("server_shutdown", "The server is restarting.", true)
			p.Close()
		}
	}
}

func (r *Room) snapshotPeers() []*Peer {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]*Peer, 0, len(r.peers))
	for _, p := range r.peers {
		out = append(out, p)
	}
	return out
}

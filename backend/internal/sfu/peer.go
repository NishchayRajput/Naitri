package sfu

import (
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

type Peer struct {
	ID     string
	PC     *webrtc.PeerConnection
	Socket *websocket.Conn

	mu sync.Mutex
}

func (p *Peer) Send(msg any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.Socket.WriteJSON(msg)
}

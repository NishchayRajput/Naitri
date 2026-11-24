package sfu

import (
	"golang.org/x/time/rate"
)

// peerLimits rate-limits what one client may send over its signaling socket.
//
// Without it, a single participant can flood chat or presence updates. Each
// of those is fanned out to everyone in the room, so the flood fills other
// people's send queues and disrupts the whole meeting.
type peerLimits struct {
	// overall caps every inbound message. It is generous, because ICE
	// trickle at join time is legitimately bursty; exceeding it means the
	// client is misbehaving and gets disconnected.
	overall *rate.Limiter

	// Per-type limits for messages that fan out to the room or are costly to
	// process. Exceeding them drops the message instead of disconnecting.
	chat      *rate.Limiter
	state     *rate.Limiter
	negotiate *rate.Limiter
	host      *rate.Limiter
	// Drawing streams a stroke chunk every ~50ms, so the board budget sits
	// well above that; cursors are presence only and dropped when over.
	board  *rate.Limiter
	cursor *rate.Limiter

	// errors throttles our own error replies so that answering a flood does
	// not become a flood.
	errors *rate.Limiter
}

func newPeerLimits() *peerLimits {
	return &peerLimits{
		overall:   rate.NewLimiter(80, 240),
		chat:      rate.NewLimiter(2, 10),
		state:     rate.NewLimiter(10, 20),
		negotiate: rate.NewLimiter(2, 10),
		host:      rate.NewLimiter(2, 10),
		board:     rate.NewLimiter(40, 80),
		cursor:    rate.NewLimiter(15, 30),
		errors:    rate.NewLimiter(1, 3),
	}
}

// forType returns the per-type limiter for a message, or nil when the type
// has no dedicated limit beyond the overall one.
func (l *peerLimits) forType(typ string) *rate.Limiter {
	switch typ {
	case TypeChat:
		return l.chat
	case TypeState:
		return l.state
	case TypePublisherOffer, TypeSubscriberAnswer:
		return l.negotiate
	case TypeLock, TypeRemovePeer:
		return l.host
	case TypeBoardOpen, TypeBoardStroke, TypeBoardErase, TypeBoardClear:
		return l.board
	case TypeBoardCursor:
		return l.cursor
	}
	return nil
}

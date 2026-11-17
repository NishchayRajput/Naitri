package sfu

import (
	"sync/atomic"

	"github.com/pion/rtp"
)

var testSeq atomic.Uint32

// newRTPPacket builds a well-formed packet for forwarding tests.
func newRTPPacket(payload []byte) *rtp.Packet {
	n := testSeq.Add(1)
	return &rtp.Packet{
		Header: rtp.Header{
			Version:        2,
			PayloadType:    96,
			SequenceNumber: uint16(n),
			Timestamp:      n * 3000,
			SSRC:           0x1234ABCD,
		},
		Payload: payload,
	}
}

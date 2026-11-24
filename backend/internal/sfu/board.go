package sfu

import (
	"errors"
	"math"
	"regexp"
	"sync"
)

// The shared whiteboard.
//
// Coordinates live on a fixed logical board of BoardWidth x BoardHeight units,
// independent of anyone's screen size; clients scale it to fit. Strokes are
// streamed in chunks while they are being drawn so other people see the line
// appear live rather than when the pen lifts.
//
// The board is held in memory with the room and disappears when the room
// empties, like everything else about a live meeting.

const (
	BoardWidth  = 1600
	BoardHeight = 900

	// Caps on what a room's board may hold, so a single client cannot grow
	// server memory (or every late joiner's welcome message) without bound.
	maxBoardStrokes   = 3000
	maxBoardPoints    = 200_000 // x,y pairs across the whole board
	maxStrokePoints   = 5000    // x,y pairs in one stroke
	maxPointsPerChunk = 500     // x,y pairs in one board-stroke message
	maxEraseIDs       = 200
	minStrokeWidth    = 1
	maxStrokeWidth    = 48
	maxStrokeIDLen    = 40
)

type BoardTool string

const (
	ToolPen         BoardTool = "pen"
	ToolHighlighter BoardTool = "highlighter"
)

var (
	colorPattern    = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	strokeIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

	ErrBoardFull     = errors.New("the whiteboard is full; clear it to keep drawing")
	ErrStrokeInvalid = errors.New("invalid stroke")
	ErrStrokeOwner   = errors.New("stroke belongs to someone else")
)

// Stroke is one continuous line. Points is a flat [x0, y0, x1, y1, ...] list
// in board units.
type Stroke struct {
	ID     string    `json:"id"`
	PeerID string    `json:"peerId"`
	Tool   BoardTool `json:"tool"`
	Color  string    `json:"color"`
	Width  float64   `json:"width"`
	Points []float64 `json:"points"`
	Done   bool      `json:"done"`
}

// BoardSnapshot is what a late joiner receives in their welcome.
type BoardSnapshot struct {
	Open     bool     `json:"open"`
	OpenedBy string   `json:"openedBy,omitempty"`
	Strokes  []Stroke `json:"strokes"`
}

type board struct {
	mu       sync.Mutex
	open     bool
	openedBy string
	order    []string // stroke ids in drawing order
	strokes  map[string]*Stroke
	points   int
}

func newBoard() *board {
	return &board{strokes: make(map[string]*Stroke)}
}

func (b *board) setOpen(open bool, by string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.open = open
	if open {
		b.openedBy = by
	} else {
		b.openedBy = ""
	}
}

func (b *board) snapshot() BoardSnapshot {
	b.mu.Lock()
	defer b.mu.Unlock()

	out := BoardSnapshot{Open: b.open, OpenedBy: b.openedBy, Strokes: make([]Stroke, 0, len(b.order))}
	for _, id := range b.order {
		s := b.strokes[id]
		cp := *s
		cp.Points = append([]float64(nil), s.Points...)
		out.Strokes = append(out.Strokes, cp)
	}
	return out
}

// appendStroke validates a stroke chunk from peerID and merges it into the
// board. The first chunk of a stroke creates it and must carry tool, colour
// and width; later chunks only append points. It returns the sanitised chunk
// to broadcast.
func (b *board) appendStroke(peerID string, chunk Stroke) (Stroke, error) {
	if !strokeIDPattern.MatchString(chunk.ID) {
		return Stroke{}, ErrStrokeInvalid
	}
	if len(chunk.Points)%2 != 0 || len(chunk.Points)/2 > maxPointsPerChunk {
		return Stroke{}, ErrStrokeInvalid
	}
	points, err := sanitisePoints(chunk.Points)
	if err != nil {
		return Stroke{}, err
	}
	pairs := len(points) / 2

	b.mu.Lock()
	defer b.mu.Unlock()

	existing, ok := b.strokes[chunk.ID]
	if !ok {
		if chunk.Tool != ToolPen && chunk.Tool != ToolHighlighter {
			return Stroke{}, ErrStrokeInvalid
		}
		if !colorPattern.MatchString(chunk.Color) {
			return Stroke{}, ErrStrokeInvalid
		}
		if math.IsNaN(chunk.Width) || chunk.Width < minStrokeWidth || chunk.Width > maxStrokeWidth {
			return Stroke{}, ErrStrokeInvalid
		}
		if len(b.order) >= maxBoardStrokes || b.points+pairs > maxBoardPoints {
			return Stroke{}, ErrBoardFull
		}

		s := &Stroke{
			ID:     chunk.ID,
			PeerID: peerID,
			Tool:   chunk.Tool,
			Color:  chunk.Color,
			Width:  chunk.Width,
			Points: points,
			Done:   chunk.Done,
		}
		b.strokes[s.ID] = s
		b.order = append(b.order, s.ID)
		b.points += pairs

		out := *s
		out.Points = points
		return out, nil
	}

	if existing.PeerID != peerID {
		return Stroke{}, ErrStrokeOwner
	}
	if existing.Done {
		return Stroke{}, ErrStrokeInvalid
	}
	if len(existing.Points)/2+pairs > maxStrokePoints {
		return Stroke{}, ErrStrokeInvalid
	}
	if b.points+pairs > maxBoardPoints {
		return Stroke{}, ErrBoardFull
	}

	existing.Points = append(existing.Points, points...)
	existing.Done = chunk.Done
	b.points += pairs

	// Continuation chunks only need the new points; receivers already have
	// the stroke's style from its first chunk.
	return Stroke{ID: existing.ID, PeerID: peerID, Points: points, Done: chunk.Done}, nil
}

// erase removes strokes by id and returns the ids that actually existed.
// Erasing is collaborative: anyone at the board can erase any stroke, as with
// a physical whiteboard. The host can remove disruptive participants.
func (b *board) erase(ids []string) []string {
	b.mu.Lock()
	defer b.mu.Unlock()

	removed := make([]string, 0, len(ids))
	for _, id := range ids {
		s, ok := b.strokes[id]
		if !ok {
			continue
		}
		b.points -= len(s.Points) / 2
		delete(b.strokes, id)
		removed = append(removed, id)
	}
	if len(removed) > 0 {
		kept := b.order[:0]
		for _, id := range b.order {
			if _, ok := b.strokes[id]; ok {
				kept = append(kept, id)
			}
		}
		b.order = kept
	}
	return removed
}

func (b *board) clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.order = nil
	b.strokes = make(map[string]*Stroke)
	b.points = 0
}

// sanitisePoints rejects non-finite values and clamps everything onto the
// board, rounding to a tenth of a unit to keep messages small.
func sanitisePoints(in []float64) ([]float64, error) {
	out := make([]float64, len(in))
	for i, v := range in {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, ErrStrokeInvalid
		}
		limit := float64(BoardWidth)
		if i%2 == 1 {
			limit = BoardHeight
		}
		v = math.Max(0, math.Min(limit, v))
		out[i] = math.Round(v*10) / 10
	}
	return out, nil
}

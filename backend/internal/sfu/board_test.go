package sfu

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func validStroke(id string, points ...float64) Stroke {
	return Stroke{ID: id, Tool: ToolPen, Color: "#2563eb", Width: 4, Points: points}
}

func TestBoardRejectsInvalidStrokes(t *testing.T) {
	cases := map[string]Stroke{
		"bad id":        {ID: "has space", Tool: ToolPen, Color: "#000000", Width: 4},
		"long id":       {ID: string(make([]byte, 41)), Tool: ToolPen, Color: "#000000", Width: 4},
		"bad tool":      {ID: "a", Tool: "laser", Color: "#000000", Width: 4},
		"bad color":     {ID: "a", Tool: ToolPen, Color: "red; background:url(x)", Width: 4},
		"width zero":    {ID: "a", Tool: ToolPen, Color: "#000000", Width: 0},
		"width huge":    {ID: "a", Tool: ToolPen, Color: "#000000", Width: 500},
		"odd points":    {ID: "a", Tool: ToolPen, Color: "#000000", Width: 4, Points: []float64{1, 2, 3}},
		"nan point":     {ID: "a", Tool: ToolPen, Color: "#000000", Width: 4, Points: []float64{math.NaN(), 1}},
		"inf point":     {ID: "a", Tool: ToolPen, Color: "#000000", Width: 4, Points: []float64{math.Inf(1), 1}},
		"chunk too big": {ID: "a", Tool: ToolPen, Color: "#000000", Width: 4, Points: make([]float64, (maxPointsPerChunk+1)*2)},
	}
	for name, s := range cases {
		b := newBoard()
		if _, err := b.appendStroke("p1", s); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestBoardClampsPointsOntoTheBoard(t *testing.T) {
	b := newBoard()
	out, err := b.appendStroke("p1", validStroke("s1", -50, 99999, 12.345, 450))
	if err != nil {
		t.Fatal(err)
	}
	want := []float64{0, BoardHeight, 12.3, 450}
	for i := range want {
		if out.Points[i] != want[i] {
			t.Fatalf("points = %v, want %v", out.Points, want)
		}
	}
}

func TestBoardStrokeContinuationAndOwnership(t *testing.T) {
	b := newBoard()
	if _, err := b.appendStroke("p1", validStroke("s1", 1, 1)); err != nil {
		t.Fatal(err)
	}
	// Someone else cannot append to (hijack) p1's stroke.
	if _, err := b.appendStroke("p2", Stroke{ID: "s1", Points: []float64{2, 2}}); err != ErrStrokeOwner {
		t.Fatalf("foreign append: got %v, want ErrStrokeOwner", err)
	}
	// The owner can, and continuation chunks need no style.
	out, err := b.appendStroke("p1", Stroke{ID: "s1", Points: []float64{2, 2}, Done: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Points) != 2 || out.Color != "" {
		t.Fatalf("continuation should carry only new points, got %+v", out)
	}
	// A finished stroke is closed.
	if _, err := b.appendStroke("p1", Stroke{ID: "s1", Points: []float64{3, 3}}); err == nil {
		t.Fatal("appended to a finished stroke")
	}
	snap := b.snapshot()
	if len(snap.Strokes) != 1 || len(snap.Strokes[0].Points) != 4 {
		t.Fatalf("snapshot = %+v", snap)
	}
}

func TestBoardEnforcesCapacity(t *testing.T) {
	b := newBoard()
	for i := 0; i < maxBoardStrokes; i++ {
		if _, err := b.appendStroke("p1", validStroke(idFor(i), 1, 1)); err != nil {
			t.Fatalf("stroke %d: %v", i, err)
		}
	}
	if _, err := b.appendStroke("p1", validStroke("overflow", 1, 1)); err != ErrBoardFull {
		t.Fatalf("got %v, want ErrBoardFull", err)
	}
	b.clear()
	if _, err := b.appendStroke("p1", validStroke("after-clear", 1, 1)); err != nil {
		t.Fatalf("clear did not free capacity: %v", err)
	}
}

func TestBoardEraseReturnsOnlyExisting(t *testing.T) {
	b := newBoard()
	_, _ = b.appendStroke("p1", validStroke("a", 1, 1))
	_, _ = b.appendStroke("p2", validStroke("b", 1, 1))
	removed := b.erase([]string{"a", "missing"})
	if len(removed) != 1 || removed[0] != "a" {
		t.Fatalf("removed = %v", removed)
	}
	if snap := b.snapshot(); len(snap.Strokes) != 1 || snap.Strokes[0].ID != "b" {
		t.Fatalf("snapshot after erase = %+v", snap)
	}
	if b.points != 1 {
		t.Fatalf("point budget not released: %d", b.points)
	}
}

func idFor(i int) string {
	const digits = "0123456789abcdef"
	out := []byte("s")
	for {
		out = append(out, digits[i%16])
		i /= 16
		if i == 0 {
			return string(out)
		}
	}
}

// End to end: strokes stream live to others, late joiners get the board in
// their welcome, and clear reaches everyone.
func TestBoardSyncsBetweenPeers(t *testing.T) {
	srv, _ := newTestServer(t, 10)

	alice := dialClient(t, wsURL(srv, "user=alice&host=1"))
	defer alice.close()
	bob := dialClient(t, wsURL(srv, "user=bob"))
	defer bob.close()
	aliceWelcome := waitWelcome(t, alice)
	waitWelcome(t, bob)

	alice.send(TypeBoardOpen, BoardOpenPayload{Open: true})
	alice.send(TypeBoardStroke, validStroke("s1", 10, 10, 20, 20))
	alice.send(TypeBoardStroke, Stroke{ID: "s1", Points: []float64{30, 30}, Done: true})

	state := waitBoard(t, bob, TypeBoardState)
	var st BoardStatePayload
	_ = json.Unmarshal(state.Payload, &st)
	if !st.Open || st.By != aliceWelcome.Self.PeerID {
		t.Fatalf("board-state = %+v", st)
	}
	first := waitBoard(t, bob, TypeBoardStroke)
	var s Stroke
	_ = json.Unmarshal(first.Payload, &s)
	if s.ID != "s1" || s.PeerID != aliceWelcome.Self.PeerID || s.Color != "#2563eb" {
		t.Fatalf("first chunk = %+v", s)
	}
	waitBoard(t, bob, TypeBoardStroke)

	// A late joiner sees the open board with the full stroke.
	carol := dialClient(t, wsURL(srv, "user=carol"))
	defer carol.close()
	cw := waitWelcome(t, carol)
	if !cw.Board.Open || len(cw.Board.Strokes) != 1 || len(cw.Board.Strokes[0].Points) != 6 {
		t.Fatalf("late joiner board = %+v", cw.Board)
	}

	bob.send(TypeBoardClear, nil)
	waitBoard(t, carol, TypeBoardClear)
}

func waitBoard(t *testing.T, c *testClient, typ string) Message {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case m := <-c.board:
			if m.Type == typ {
				return m
			}
		case <-deadline:
			t.Fatalf("never received %s", typ)
			return Message{}
		}
	}
}

package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// The request logger wraps http.ResponseWriter, and gorilla/websocket
// type-asserts for http.Hijacker directly rather than using
// http.ResponseController. A wrapper that does not forward Hijack turns every
// signaling handshake into a 500, which no HTTP-level test would catch.
func TestRequestLoggerPreservesWebSocketUpgrade(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	ws := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade through middleware: %v", err)
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("hello"))
	})

	// Exercise the full chain the real router builds.
	var handler http.Handler = ws
	handler = CORS([]string{"*"})(handler)
	handler = RequestLogger(log)(handler)
	handler = Recover(log)(handler)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	conn, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("dial through middleware failed (status %d): %v", status, err)
	}
	defer conn.Close()

	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(payload) != "hello" {
		t.Fatalf("payload = %q, want %q", payload, "hello")
	}
}

func TestCORSRejectsUnlistedOrigin(t *testing.T) {
	handler := CORS([]string{"http://localhost:3000"})(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	for origin, wantEcho := range map[string]bool{
		"http://localhost:3000": true,
		"http://evil.example":   false,
	} {
		req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
		req.Header.Set("Origin", origin)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		resp.Body.Close()

		got := resp.Header.Get("Access-Control-Allow-Origin")
		if wantEcho && got != origin {
			t.Errorf("origin %q: Allow-Origin = %q, want %q", origin, got, origin)
		}
		if !wantEcho && got != "" {
			t.Errorf("origin %q: Allow-Origin = %q, want it absent", origin, got)
		}
	}
}

// A preflight must be answered even though no GET/POST route matches OPTIONS.
func TestCORSAnswersPreflight(t *testing.T) {
	handler := CORS([]string{"http://localhost:3000"})(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			t.Error("preflight should not reach the inner handler")
		}),
	)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/v1/rooms", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "POST")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}
	if resp.Header.Get("Access-Control-Allow-Methods") == "" {
		t.Error("preflight response is missing Access-Control-Allow-Methods")
	}
}

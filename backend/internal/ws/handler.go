package ws

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID   string
	Conn *websocket.Conn
}

type Room struct {
	Clients map[string]*Client
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	rooms   = make(map[string]*Room)
	roomsMu sync.Mutex
)

type SignalMessage struct {
	Type      string      `json:"type"`
	RoomID    string      `json:"roomId"`
	PeerID    string      `json:"peerId"`
	TargetID  string      `json:"targetId,omitempty"`
	SDP       string      `json:"sdp,omitempty"`
	Candidate interface{} `json:"candidate,omitempty"`
}

func HandleWS(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomId")
	peerID := r.URL.Query().Get("peerId")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade failed:", err)
		return
	}
	defer conn.Close()

	// Join room
	roomsMu.Lock()
	if _, ok := rooms[roomID]; !ok {
		rooms[roomID] = &Room{Clients: make(map[string]*Client)}
	}
	room := rooms[roomID]
	room.Clients[peerID] = &Client{ID: peerID, Conn: conn}
	// Notify existing peers that a new peer joined
	for _, client := range room.Clients {
		if client.ID != peerID {
			client.Conn.WriteJSON(map[string]string{
				"type":   "peer-joined",
				"peerId": peerID,
			})
		}
	}

	roomsMu.Unlock()

	log.Printf("peer %s joined room %s\n", peerID, roomID)

	// Message loop
	for {
		var msg SignalMessage
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("read error:", err)
			break
		}

		// Forward message to all other peers in room
		roomsMu.Lock()
		for id, client := range room.Clients {
			if id != peerID {
				client.Conn.WriteJSON(msg)
			}
		}
		roomsMu.Unlock()
	}

	// Cleanup
	roomsMu.Lock()
	delete(room.Clients, peerID)
	if len(room.Clients) == 0 {
		delete(rooms, roomID)
	}
	roomsMu.Unlock()

	log.Printf("peer %s left room %s\n", peerID, roomID)
}

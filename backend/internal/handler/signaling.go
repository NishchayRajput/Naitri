package handler

import (
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/middleware"
	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/sfu"
	"github.com/nishchayrajput/naitri/internal/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// SignalingHandler authenticates a WebSocket handshake and hands the socket to
// the SFU. Authentication happens before the upgrade so a rejected client gets
// a normal HTTP status it can act on, rather than an opaque socket close.
type SignalingHandler struct {
	manager  *sfu.Manager
	rooms    *service.RoomService
	authSvc  *service.AuthService
	issuer   *auth.Issuer
	upgrader *websocket.Upgrader
	log      *slog.Logger
}

func NewSignalingHandler(
	manager *sfu.Manager,
	rooms *service.RoomService,
	authSvc *service.AuthService,
	issuer *auth.Issuer,
	allowedOrigins []string,
	log *slog.Logger,
) *SignalingHandler {
	return &SignalingHandler{
		manager:  manager,
		rooms:    rooms,
		authSvc:  authSvc,
		issuer:   issuer,
		upgrader: sfu.NewUpgrader(allowedOrigins, log),
		log:      log,
	}
}

func (h *SignalingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The browser WebSocket API cannot set an Authorization header, so the
	// access token arrives as a query parameter. It is short-lived by design.
	token := middleware.BearerToken(r)
	if token == "" {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to join this meeting.")
		return
	}

	claims, err := h.issuer.Verify(token, auth.KindAccess)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Your session expired. Please sign in again.")
		return
	}

	code := service.NormalizeCode(r.URL.Query().Get("room"))
	if code == "" {
		utils.Error(w, http.StatusBadRequest, "missing_room", "No meeting code was provided.")
		return
	}

	userID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to join this meeting.")
		return
	}

	// Re-check the room on every socket: a meeting can be locked or ended
	// between the lobby's REST call and the actual join.
	room, err := h.rooms.Resolve(r.Context(), code, userID)
	if err != nil {
		writeRoomError(w, err)
		return
	}

	// Read the stored profile so the display name and colour come from the
	// database rather than from client-supplied claims.
	user, err := h.authSvc.UserByID(r.Context(), claims.Subject)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to join this meeting.")
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote an error response.
		h.log.Debug("websocket upgrade failed", "error", err)
		return
	}

	liveRoom := h.manager.GetOrCreateRoom(room.Code, sfu.RoomInfo{
		Code:     room.Code,
		Name:     room.Name,
		HostName: room.HostName,
		Locked:   room.Locked,
	})

	h.manager.Join(conn, liveRoom, sfu.Identity{
		UserID:      claims.Subject,
		Name:        user.Name,
		AvatarColor: user.AvatarColor,
		IsHost:      room.IsHost(userID),
	})
}

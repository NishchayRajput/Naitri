package handler

import (
	"errors"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/nishchayrajput/naitri/internal/middleware"
	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/sfu"
	"github.com/nishchayrajput/naitri/internal/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type RoomHandler struct {
	rooms   *service.RoomService
	manager *sfu.Manager
}

func NewRoomHandler(rooms *service.RoomService, manager *sfu.Manager) *RoomHandler {
	return &RoomHandler{rooms: rooms, manager: manager}
}

func (h *RoomHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFrom(r.Context())
	if !ok {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	// An empty body is valid here: it means "create an instant meeting".
	if r.ContentLength > 0 {
		if err := utils.DecodeJSON(w, r, &req); err != nil {
			utils.Error(w, http.StatusBadRequest, "invalid_body", "Could not read that request.")
			return
		}
	}

	hostID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	room, err := h.rooms.Create(r.Context(), hostID, claims.Name, req.Name)
	if err != nil {
		writeRoomError(w, err)
		return
	}
	utils.JSON(w, http.StatusCreated, map[string]any{"room": room})
}

// Get resolves a meeting code before the client opens a socket, so the lobby
// can show "meeting not found" or "locked" without a failed WebSocket attempt.
func (h *RoomHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFrom(r.Context())
	if !ok {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	userID, _ := bson.ObjectIDFromHex(claims.Subject)
	code := service.NormalizeCode(mux.Vars(r)["code"])

	room, err := h.rooms.Resolve(r.Context(), code, userID)
	if err != nil {
		writeRoomError(w, err)
		return
	}

	// Live occupancy lets the lobby say "3 people are already here".
	occupancy := 0
	if live := h.manager.Room(room.Code); live != nil {
		occupancy = live.Size()
	}

	utils.JSON(w, http.StatusOK, map[string]any{
		"room":      room,
		"isHost":    room.IsHost(userID),
		"occupancy": occupancy,
	})
}

func (h *RoomHandler) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFrom(r.Context())
	if !ok {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	hostID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	rooms, err := h.rooms.ListByHost(r.Context(), hostID)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "internal_error", "Could not load your meetings.")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]any{"rooms": rooms})
}

func writeRoomError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrRoomNotFound):
		utils.Error(w, http.StatusNotFound, "room_not_found", err.Error())
	case errors.Is(err, service.ErrRoomEnded):
		utils.Error(w, http.StatusGone, "room_ended", err.Error())
	case errors.Is(err, service.ErrRoomBanned):
		utils.Error(w, http.StatusForbidden, "removed_from_room", err.Error())
	case errors.Is(err, service.ErrRoomLocked):
		utils.Error(w, http.StatusForbidden, "room_locked", err.Error())
	case errors.Is(err, service.ErrNotRoomHost):
		utils.Error(w, http.StatusForbidden, "not_host", err.Error())
	case errors.Is(err, service.ErrValidation):
		utils.Error(w, http.StatusBadRequest, "validation_failed", err.Error())
	default:
		utils.Error(w, http.StatusInternalServerError, "internal_error", "Something went wrong on our end.")
	}
}

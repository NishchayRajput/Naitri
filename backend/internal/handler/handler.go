package handler

import (
	"log/slog"

	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/sfu"
)

type Handler struct {
	Auth      *AuthHandler
	Room      *RoomHandler
	Signaling *SignalingHandler
	Health    *HealthHandler
}

func New(
	svc *service.Service,
	manager *sfu.Manager,
	issuer *auth.Issuer,
	allowedOrigins []string,
	log *slog.Logger,
) *Handler {
	return &Handler{
		Auth:      NewAuthHandler(svc.Auth),
		Room:      NewRoomHandler(svc.Room, manager),
		Signaling: NewSignalingHandler(manager, svc.Room, svc.Auth, issuer, allowedOrigins, log),
		Health:    NewHealthHandler(manager),
	}
}

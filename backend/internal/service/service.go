package service

import (
	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/repository"
)

type Service struct {
	Auth *AuthService
	Room *RoomService
}

func New(repo *repository.Repository, issuer *auth.Issuer) *Service {
	return &Service{
		Auth: NewAuthService(repo.Users, issuer),
		Room: NewRoomService(repo.Rooms),
	}
}

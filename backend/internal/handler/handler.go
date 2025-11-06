package handler

import (
	handler "github.com/nishchayrajput/naitri/internal/handler/auth"
	"github.com/nishchayrajput/naitri/internal/service"
)

type Handler struct {
	AuthHandler *handler.AuthHandler
	// Add more services here as needed, e.g.:
	// UserService *service.UserService
	// ProductService *service.ProductService
}

func NewHandler(authService *service.AuthService /*, other services */) *Handler {
	authHandler := handler.NewAuthHandler(authService)
	return &Handler{
		AuthHandler: authHandler,
		// UserService: userService,
		// ProductService: productService,
	}
}

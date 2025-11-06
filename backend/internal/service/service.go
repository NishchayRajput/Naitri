package service

import (
	"github.com/nishchayrajput/naitri/internal/repository"
)

type Service struct {
	AuthService *AuthService
	// Add more services here as needed
	// UserService *UserService
	// ProductService *ProductService
}

func NewService(userRepo *repository.UserRepository, jwtSecret []byte /*, other repos */) *Service {
	authService := &AuthService{
		JWTSecret: jwtSecret,
		uRepo:     userRepo,
	}
	return &Service{
		AuthService: authService,
		// UserService: userService,
		// ProductService: productService,
	}
}

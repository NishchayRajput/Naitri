package service

import (
	"errors"
	"time"

	"github.com/nishchayrajput/naitri/internal/model"
	"github.com/nishchayrajput/naitri/internal/repository"
	"github.com/nishchayrajput/naitri/internal/utils"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AuthService struct {
	JWTSecret []byte
	uRepo     *repository.UserRepository
}

func (s *AuthService) SignupService(email string, password string, name string) error {
	if email == "" || password == "" || name == "" {
		return errors.New("all fields are required")
	}

	existingUser, _ := s.uRepo.GetUserByEmail(email)
	if existingUser != nil {
		return errors.New("user already exists")
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	user := &model.User{
		Name:      name,
		Email:     email,
		Password:  hash,
		ID:        primitive.NewObjectID().Hex(),
		CreatedAt: time.Now().Unix(),
	}
	return s.uRepo.CreateUser(user)
}

func (s *AuthService) LoginService(email string, password string) (string, *model.User, error) {
	user, err := s.uRepo.GetUserByEmail(email)
	if err != nil {
		return "", nil, errors.New("user not found")
	}

	if !utils.CheckPasswordHash(user.Password, password) {
		return "", nil, errors.New("invalid credentials")
	}

	token, err := utils.GenerateJWT(user.Email, s.JWTSecret)

	if err != nil {
		return "", nil, err
	}

	return token, user, nil
}

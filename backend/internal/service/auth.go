package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/model"
	"github.com/nishchayrajput/naitri/internal/repository"
	"github.com/nishchayrajput/naitri/internal/utils"
)

var (
	ErrInvalidCredentials = errors.New("incorrect email or password")
	ErrEmailTaken         = errors.New("an account with that email already exists")
	ErrValidation         = errors.New("validation failed")
)

const (
	minPasswordLen = 8
	maxPasswordLen = 128 // bcrypt silently truncates past 72 bytes; cap well before surprises
	maxNameLen     = 64
)

// avatarPalette gives each account a stable accent colour, used by the UI for
// initials avatars so a user looks the same in every room.
var avatarPalette = []string{
	"#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
	"#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
}

type AuthService struct {
	users  *repository.UserRepository
	issuer *auth.Issuer
}

func NewAuthService(users *repository.UserRepository, issuer *auth.Issuer) *AuthService {
	return &AuthService{users: users, issuer: issuer}
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
	User         model.PublicUser
}

func (s *AuthService) Signup(ctx context.Context, name, email, password string) (*TokenPair, error) {
	name = strings.TrimSpace(name)
	email = repository.NormalizeEmail(email)

	if err := validateName(name); err != nil {
		return nil, err
	}
	if err := validateEmail(email); err != nil {
		return nil, err
	}
	if err := validatePassword(password); err != nil {
		return nil, err
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &model.User{
		Name:         name,
		Email:        email,
		PasswordHash: hash,
		AvatarColor:  avatarPalette[int(crc(email))%len(avatarPalette)],
	}

	// Rely on the unique index rather than a prior existence check, which would
	// race with a concurrent signup for the same address.
	if err := s.users.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrDuplicateUser) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}

	return s.mintTokens(user)
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*TokenPair, error) {
	user, err := s.users.ByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Same error and roughly the same cost as a bad password, so the
			// response does not reveal whether an account exists.
			utils.HashPassword(password) //nolint:errcheck // deliberate timing equalisation
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !utils.CheckPasswordHash(user.PasswordHash, password) {
		return nil, ErrInvalidCredentials
	}

	return s.mintTokens(user)
}

// Refresh exchanges a valid refresh token for a new token pair, re-reading the
// user so a deleted or renamed account is reflected immediately.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	claims, err := s.issuer.Verify(refreshToken, auth.KindRefresh)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	user, err := s.users.ByID(ctx, claims.Subject)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.mintTokens(user)
}

func (s *AuthService) UserByID(ctx context.Context, id string) (*model.User, error) {
	return s.users.ByID(ctx, id)
}

func (s *AuthService) mintTokens(user *model.User) (*TokenPair, error) {
	id := user.ID.Hex()

	access, err := s.issuer.AccessToken(id, user.Email, user.Name)
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}
	refresh, err := s.issuer.RefreshToken(id, user.Email, user.Name)
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.issuer.AccessTTL().Seconds()),
		User:         user.Public(),
	}, nil
}

func validateName(name string) error {
	if n := utf8.RuneCountInString(name); n < 1 || n > maxNameLen {
		return fmt.Errorf("%w: name must be between 1 and %d characters", ErrValidation, maxNameLen)
	}
	return nil
}

func validateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("%w: email is required", ErrValidation)
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return fmt.Errorf("%w: that does not look like a valid email address", ErrValidation)
	}
	return nil
}

func validatePassword(password string) error {
	if n := len(password); n < minPasswordLen || n > maxPasswordLen {
		return fmt.Errorf("%w: password must be between %d and %d characters",
			ErrValidation, minPasswordLen, maxPasswordLen)
	}
	return nil
}

// crc is a tiny stable hash used only to pick an avatar colour.
func crc(s string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

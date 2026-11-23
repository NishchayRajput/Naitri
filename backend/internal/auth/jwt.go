package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenKind string

const (
	KindAccess  TokenKind = "access"
	KindRefresh TokenKind = "refresh"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
	ErrWrongKind    = errors.New("token used for the wrong purpose")
)

// Claims carries the user identity. The subject is the user id (not the email)
// so a user changing their email does not invalidate or mis-resolve tokens.
type Claims struct {
	jwt.RegisteredClaims
	Email string    `json:"email"`
	Name  string    `json:"name"`
	Kind  TokenKind `json:"kind"`
	// Family groups every refresh token descended from one login. Rotation
	// keeps the family; reuse of a rotated token revokes the whole family.
	Family string `json:"fam,omitempty"`
}

type Issuer struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewIssuer(secret []byte, accessTTL, refreshTTL time.Duration) *Issuer {
	return &Issuer{secret: secret, accessTTL: accessTTL, refreshTTL: refreshTTL}
}

func (i *Issuer) issue(userID, email, name, tokenID, family string, kind TokenKind, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        tokenID,
			Subject:   userID,
			Issuer:    "naitri",
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
		Email:  email,
		Name:   name,
		Kind:   kind,
		Family: family,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
}

func (i *Issuer) AccessToken(userID, email, name string) (string, error) {
	return i.issue(userID, email, name, "", "", KindAccess, i.accessTTL)
}

// RefreshToken mints a refresh token. tokenID (jti) and family identify the
// server-side session record that makes the token revocable.
func (i *Issuer) RefreshToken(userID, email, name, tokenID, family string) (string, error) {
	return i.issue(userID, email, name, tokenID, family, KindRefresh, i.refreshTTL)
}

func (i *Issuer) RefreshTTL() time.Duration { return i.refreshTTL }

func (i *Issuer) AccessTTL() time.Duration { return i.accessTTL }

// Verify parses and validates a token, and additionally asserts that it was
// issued for the purpose the caller expects. Without the kind check a
// long-lived refresh token would be accepted as an access token.
func (i *Issuer) Verify(token string, want TokenKind) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(
		token,
		&Claims{},
		func(t *jwt.Token) (any, error) {
			// Pin the algorithm. Accepting whatever the header declares is how
			// "alg: none" and HMAC/RSA confusion attacks get in.
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
			}
			return i.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer("naitri"),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Kind != want {
		return nil, ErrWrongKind
	}
	if claims.Subject == "" {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

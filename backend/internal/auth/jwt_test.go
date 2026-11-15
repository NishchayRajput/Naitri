package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func newTestIssuer() *Issuer {
	return NewIssuer([]byte("test-secret-at-least-32-bytes-long!!"), time.Minute, time.Hour)
}

func TestVerifyRoundTrip(t *testing.T) {
	iss := newTestIssuer()

	token, err := iss.AccessToken("user-1", "a@b.com", "Ada")
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	claims, err := iss.Verify(token, KindAccess)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if claims.Subject != "user-1" || claims.Email != "a@b.com" || claims.Name != "Ada" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

// A refresh token must not be usable as an access token: it lives far longer,
// so accepting it would silently extend every session.
func TestVerifyRejectsWrongKind(t *testing.T) {
	iss := newTestIssuer()

	refresh, err := iss.RefreshToken("user-1", "a@b.com", "Ada")
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	if _, err := iss.Verify(refresh, KindAccess); err != ErrWrongKind {
		t.Fatalf("expected ErrWrongKind, got %v", err)
	}
}

func TestVerifyRejectsForeignSignature(t *testing.T) {
	minted := newTestIssuer()
	other := NewIssuer([]byte("a-completely-different-secret-key!!!!"), time.Minute, time.Hour)

	token, err := minted.AccessToken("user-1", "a@b.com", "Ada")
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	if _, err := other.Verify(token, KindAccess); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

// "alg: none" is the classic JWT bypass; the parser must refuse it outright.
func TestVerifyRejectsUnsignedToken(t *testing.T) {
	iss := newTestIssuer()

	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "attacker",
			Issuer:    "naitri",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		Kind: KindAccess,
	})
	raw, err := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}

	if _, err := iss.Verify(raw, KindAccess); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for alg=none, got %v", err)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	iss := NewIssuer([]byte("test-secret-at-least-32-bytes-long!!"), -time.Minute, time.Hour)

	token, err := iss.AccessToken("user-1", "a@b.com", "Ada")
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	if _, err := iss.Verify(token, KindAccess); err != ErrExpiredToken {
		t.Fatalf("expected ErrExpiredToken, got %v", err)
	}
}

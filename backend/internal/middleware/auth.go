package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/utils"
)

type ctxKey int

const claimsKey ctxKey = iota

// Authenticated rejects requests without a valid access token and stashes the
// verified claims on the context for downstream handlers.
func Authenticated(issuer *auth.Issuer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := BearerToken(r)
			if token == "" {
				utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
				return
			}

			claims, err := issuer.Verify(token, auth.KindAccess)
			if err != nil {
				code, msg := "unauthenticated", "Your session is no longer valid."
				if err == auth.ErrExpiredToken {
					// Distinct code so the client knows to refresh rather than
					// bounce the user to the login screen.
					code, msg = "token_expired", "Your session expired."
				}
				utils.Error(w, http.StatusUnauthorized, code, msg)
				return
			}

			next.ServeHTTP(w, r.WithContext(WithClaims(r.Context(), claims)))
		})
	}
}

func WithClaims(ctx context.Context, claims *auth.Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}

// ClaimsFrom returns the verified claims placed by Authenticated.
func ClaimsFrom(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*auth.Claims)
	return claims, ok
}

// BearerToken pulls the token from the Authorization header, falling back to
// the `access_token` query parameter. The fallback exists for the WebSocket
// handshake: the browser WebSocket API cannot set request headers.
func BearerToken(r *http.Request) string {
	if header := r.Header.Get("Authorization"); header != "" {
		if after, found := strings.CutPrefix(header, "Bearer "); found {
			return strings.TrimSpace(after)
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("access_token"))
}

package api

import (
	"log/slog"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/config"
	"github.com/nishchayrajput/naitri/internal/handler"
	"github.com/nishchayrajput/naitri/internal/middleware"
	"github.com/nishchayrajput/naitri/internal/utils"
)

// NewRouter wires the HTTP surface: public auth endpoints, authenticated room
// endpoints, and the signaling socket.
func NewRouter(
	h *handler.Handler,
	issuer *auth.Issuer,
	cfg *config.Config,
	log *slog.Logger,
) http.Handler {
	r := mux.NewRouter()

	r.Handle("/healthz", h.Health).Methods(http.MethodGet)

	// The signaling socket authenticates itself: the WebSocket handshake
	// cannot carry an Authorization header, so it is deliberately outside the
	// Authenticated middleware.
	r.Handle("/ws", h.Signaling).Methods(http.MethodGet)

	v1 := r.PathPrefix("/api/v1").Subrouter()

	// Auth endpoints are rate limited per IP: they are the only unauthenticated
	// write surface and the natural target for credential stuffing.
	authLimiter := middleware.NewRateLimiter(20, 10)
	authRoutes := v1.PathPrefix("/auth").Subrouter()
	authRoutes.Use(authLimiter.Middleware)
	authRoutes.HandleFunc("/signup", h.Auth.Signup).Methods(http.MethodPost)
	authRoutes.HandleFunc("/login", h.Auth.Login).Methods(http.MethodPost)
	authRoutes.HandleFunc("/refresh", h.Auth.Refresh).Methods(http.MethodPost)

	me := v1.PathPrefix("/auth/me").Subrouter()
	me.Use(middleware.Authenticated(issuer))
	me.HandleFunc("", h.Auth.Me).Methods(http.MethodGet)

	rooms := v1.PathPrefix("/rooms").Subrouter()
	rooms.Use(middleware.Authenticated(issuer))
	rooms.HandleFunc("", h.Room.Create).Methods(http.MethodPost)
	rooms.HandleFunc("", h.Room.List).Methods(http.MethodGet)
	rooms.HandleFunc("/{code}", h.Room.Get).Methods(http.MethodGet)

	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		utils.Error(w, http.StatusNotFound, "not_found", "No such endpoint.")
	})
	r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		utils.Error(w, http.StatusMethodNotAllowed, "method_not_allowed", "That method is not supported here.")
	})

	// Wrapped OUTSIDE the mux rather than registered with r.Use: gorilla/mux
	// only runs Use middleware on routes that match, so a CORS preflight
	// (OPTIONS, which matches no GET/POST route) would fall through to the
	// NotFoundHandler with no CORS headers and the browser would block the
	// real request. Wrapping here also means 404s and panics in unmatched
	// routes are still logged and recovered.
	var handler http.Handler = r
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)
	handler = middleware.RequestLogger(log)(handler)
	handler = middleware.Recover(log)(handler)

	return handler
}

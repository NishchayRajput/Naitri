package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

type Server struct {
	http *http.Server
	log  *slog.Logger
}

func New(addr string, handler http.Handler, log *slog.Logger) *Server {
	return &Server{
		http: &http.Server{
			Addr:    addr,
			Handler: handler,
			// ReadHeaderTimeout guards against slowloris. A blanket ReadTimeout
			// or WriteTimeout is deliberately omitted: both apply to hijacked
			// connections and would sever long-lived signaling WebSockets.
			ReadHeaderTimeout: 10 * time.Second,
			IdleTimeout:       120 * time.Second,
			MaxHeaderBytes:    1 << 16,
		},
		log: log,
	}
}

// Start serves in the background and reports a fatal listen error on the
// returned channel.
func (s *Server) Start() <-chan error {
	errc := make(chan error, 1)

	go func() {
		s.log.Info("http server listening", "addr", s.http.Addr)
		if err := s.http.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
		close(errc)
	}()

	return errc
}

// Shutdown stops accepting connections and waits for in-flight requests.
func (s *Server) Shutdown(ctx context.Context) error {
	s.log.Info("shutting down http server")
	return s.http.Shutdown(ctx)
}

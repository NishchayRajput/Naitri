package server

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
)

type Server struct {
	httpServer *http.Server
	logger     *zap.Logger
}

func NewServer(addr string, handler http.Handler, logger *zap.Logger) *Server {
	server := Server{
		httpServer: &http.Server{
			Addr:         addr,
			Handler:      handler,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
			IdleTimeout:  120 * time.Second,
		},
		logger: logger,
	}
	return &server
}

func (s *Server) Start() {
	s.logger.Info("Starting server", zap.String("address", s.httpServer.Addr))
	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			s.logger.Fatal("Could not start server", zap.Error(err))
		}
	}()
}

func (s *Server) Shutdown() {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	s.logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)

	defer cancel()

	if err := s.httpServer.Shutdown(ctx); err != nil {
		s.logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	s.logger.Info("Server exiting")
}

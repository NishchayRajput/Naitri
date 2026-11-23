package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nishchayrajput/naitri/internal/api"
	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/config"
	"github.com/nishchayrajput/naitri/internal/handler"
	"github.com/nishchayrajput/naitri/internal/logger"
	"github.com/nishchayrajput/naitri/internal/repository"
	"github.com/nishchayrajput/naitri/internal/server"
	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/sfu"
)

func main() {
	if err := run(); err != nil {
		// Logger may not exist yet at the point of failure, so report plainly.
		println("fatal:", err.Error())
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	log := logger.New(cfg.Env)
	log.Info("starting naitri", "env", cfg.Env, "port", cfg.Port)

	// Root context cancelled on SIGINT/SIGTERM, so every long-lived goroutine
	// shares a single shutdown signal.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mongoClient, err := config.ConnectMongo(ctx, cfg.MongoURI)
	if err != nil {
		return err
	}
	defer func() {
		disconnectCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := mongoClient.Disconnect(disconnectCtx); err != nil {
			log.Error("mongo disconnect", "error", err)
		}
	}()
	log.Info("connected to mongodb", "database", cfg.MongoDB)

	repo := repository.New(mongoClient.Database(cfg.MongoDB))
	indexCtx, cancelIndex := context.WithTimeout(ctx, 20*time.Second)
	err = repo.EnsureIndexes(indexCtx)
	cancelIndex()
	if err != nil {
		return err
	}

	issuer := auth.NewIssuer(cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL)
	svc := service.New(repo, issuer)

	manager, err := sfu.NewManager(sfu.Options{
		STUNURLs:    cfg.STUNURLs,
		TURNURL:     cfg.TURNURL,
		TURNUser:    cfg.TURNUser,
		TURNPass:    cfg.TURNPass,
		TURNSecret:  cfg.TURNSecret,
		TURNCredTTL: cfg.TURNCredTTL,
		PublicIP:    cfg.PublicIP,
		MaxRoomSize: cfg.MaxRoomSize,
	}, log)
	if err != nil {
		return err
	}
	// Persist host-initiated locks without the SFU importing the service layer.
	manager.SetHooks(sfu.Hooks{
		OnLockChange: func(ctx context.Context, code string, locked bool) error {
			room, err := repo.Rooms.ByCode(ctx, code)
			if err != nil {
				return err
			}
			return svc.Room.SetLocked(ctx, code, room.HostID, locked)
		},
		OnBan: func(ctx context.Context, code string, userID string) error {
			return svc.Room.Ban(ctx, code, userID)
		},
	})

	if cfg.TURNURL == "" {
		log.Warn("no TURN server configured; clients behind symmetric NAT will fail to connect")
	} else if cfg.TURNSecret == "" {
		log.Warn("TURN uses static credentials, which every signed-in user receives; set TURN_SECRET for time-limited credentials")
	}

	handlers := handler.New(svc, manager, issuer, cfg.AllowedOrigins, log)
	router := api.NewRouter(handlers, issuer, cfg, log)

	srv := server.New(":"+cfg.Port, router, log)
	serveErr := srv.Start()

	select {
	case err := <-serveErr:
		if err != nil {
			return err
		}
	case <-ctx.Done():
		log.Info("shutdown signal received")
	}

	// Disconnect peers first so browsers see a clean close rather than a
	// timeout, then drain HTTP.
	manager.Shutdown()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", "error", err)
	}

	log.Info("naitri stopped")
	return nil
}

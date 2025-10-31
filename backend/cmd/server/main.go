package main

import (
	"github.com/nishchayrajput/naitri/internal/config"
	"github.com/nishchayrajput/naitri/internal/server"
	"go.uber.org/zap"
)

func main() {

	logger, _ := zap.NewProduction()

	cfg := config.LoadConfig()
	srv := server.NewServer(":"+cfg.Port, nil, logger)

	srv.Start()

	srv.Shutdown()
}

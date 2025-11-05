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

	client := config.ConnectMongo(cfg.MongoURI)
	logger.Info("MongoDB client initialized", zap.Any("client", client))

	defer config.DisconnectMongo()

	srv.Start()
	srv.Shutdown()
}

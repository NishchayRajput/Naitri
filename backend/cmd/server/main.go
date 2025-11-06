package main

import (
	"log"
	"net/http"

	"github.com/nishchayrajput/naitri/internal/api"
	"github.com/nishchayrajput/naitri/internal/config"
	"github.com/nishchayrajput/naitri/internal/handler"
	"github.com/nishchayrajput/naitri/internal/repository"
	"github.com/nishchayrajput/naitri/internal/service"
)

func main() {
	cfg := config.LoadConfig()
	mongoClient := config.ConnectMongo(cfg.MongoURI)
	db := mongoClient.Database("naitri")

	// jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	userRepo := repository.NewUserRepository(db)

	services := service.NewService(userRepo, []byte(cfg.JWTSecret))
	handlers := handler.NewHandler(services.AuthService /*, other services */)

	router := api.NewRouter(handlers)
	// auth.NewAuthRoutes(router, handlers)

	log.Fatal(http.ListenAndServe(":8080", router))
}

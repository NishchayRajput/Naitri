package api

import (
	"github.com/gorilla/mux"
	api "github.com/nishchayrajput/naitri/internal/api/auth"
	"github.com/nishchayrajput/naitri/internal/handler"
	"github.com/nishchayrajput/naitri/internal/ws"
)

func NewRouter(handlers *handler.Handler) *mux.Router {
	router := mux.NewRouter()

	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	router.HandleFunc("/ws", ws.HandleWS)

	api.NewAuthRoutes(apiRouter, handlers)

	return router
}

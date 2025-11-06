package api

import (
	"github.com/gorilla/mux"
	api "github.com/nishchayrajput/naitri/internal/api/auth"
	"github.com/nishchayrajput/naitri/internal/handler"
)

func NewRouter(handlers *handler.Handler) *mux.Router {
	router := mux.NewRouter()

	apiRouter := router.PathPrefix("/api/v1").Subrouter()

	api.NewAuthRoutes(apiRouter, handlers)

	return router
}

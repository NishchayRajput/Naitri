package auth

import (
	"github.com/gorilla/mux"
	"github.com/nishchayrajput/naitri/internal/handler"
)

func NewAuthRoutes(router *mux.Router, handlers *handler.Handler) {
	authRouter := router.PathPrefix("/auth").Subrouter()
	authRouter.HandleFunc("/login", handlers.AuthHandler.LoginHandler).Methods("POST")
	authRouter.HandleFunc("/signup", handlers.AuthHandler.SignUpHandler).Methods("POST")
}

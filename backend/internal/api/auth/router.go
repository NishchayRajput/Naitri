package api

import (
	"github.com/gorilla/mux"
	"github.com/nishchayrajput/naitri/internal/handler/auth"
)

func NewAuthRoutes(router *mux.Router) {
	authRouter := router.PathPrefix("auth/").Subrouter()

	authRouter.HandleFunc("login/", auth.LoginHandler).Methods("POST")
	authRouter.HandleFunc("signup/", auth.SignUpHandler).Methods("POST")

}

package handler

import (
	"errors"
	"net/http"

	"github.com/nishchayrajput/naitri/internal/middleware"
	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/utils"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

type authResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	User         any    `json:"user"`
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := utils.DecodeJSON(w, r, &req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid_body", "Could not read that request.")
		return
	}

	tokens, err := h.auth.Signup(r.Context(), req.Name, req.Email, req.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	utils.JSON(w, http.StatusCreated, toAuthResponse(tokens))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := utils.DecodeJSON(w, r, &req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid_body", "Could not read that request.")
		return
	}

	tokens, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	utils.JSON(w, http.StatusOK, toAuthResponse(tokens))
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := utils.DecodeJSON(w, r, &req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid_body", "Could not read that request.")
		return
	}

	tokens, err := h.auth.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "invalid_refresh_token", "Please sign in again.")
		return
	}
	utils.JSON(w, http.StatusOK, toAuthResponse(tokens))
}

// Me re-reads the user so the client can validate a stored session on boot.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFrom(r.Context())
	if !ok {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	user, err := h.auth.UserByID(r.Context(), claims.Subject)
	if err != nil {
		utils.Error(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]any{"user": user.Public()})
}

func toAuthResponse(t *service.TokenPair) authResponse {
	return authResponse{
		AccessToken:  t.AccessToken,
		RefreshToken: t.RefreshToken,
		ExpiresIn:    t.ExpiresIn,
		User:         t.User,
	}
}

func writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidCredentials):
		utils.Error(w, http.StatusUnauthorized, "invalid_credentials", err.Error())
	case errors.Is(err, service.ErrEmailTaken):
		utils.Error(w, http.StatusConflict, "email_taken", err.Error())
	case errors.Is(err, service.ErrValidation):
		utils.Error(w, http.StatusBadRequest, "validation_failed", err.Error())
	default:
		utils.Error(w, http.StatusInternalServerError, "internal_error", "Something went wrong on our end.")
	}
}

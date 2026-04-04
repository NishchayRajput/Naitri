package handler

import (
	"encoding/json"
	"net/http"

	"github.com/nishchayrajput/naitri/internal/service"
	"github.com/nishchayrajput/naitri/internal/utils"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

func (h *AuthHandler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	token, user, err := h.authService.LoginService(req.Email, req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	utils.JsonResponse(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]string{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
	})
}

func (h *AuthHandler) SignUpHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if err := h.authService.SignupService(req.Email, req.Password, req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	utils.JsonResponse(w, http.StatusCreated, map[string]string{"message": "User created successfully"})
}

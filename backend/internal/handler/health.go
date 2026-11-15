package handler

import (
	"net/http"

	"github.com/nishchayrajput/naitri/internal/sfu"
	"github.com/nishchayrajput/naitri/internal/utils"
)

type HealthHandler struct {
	manager *sfu.Manager
}

func NewHealthHandler(manager *sfu.Manager) *HealthHandler {
	return &HealthHandler{manager: manager}
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rooms, participants := h.manager.Stats()
	utils.JSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"rooms":        rooms,
		"participants": participants,
	})
}

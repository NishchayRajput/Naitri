package utils

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if data == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// The status line is already flushed, so the response cannot be
		// corrected; record it instead of silently dropping it.
		slog.Error("encode json response", "error", err)
	}
}

type ErrorBody struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// Error writes a machine-readable code plus a human message, so the frontend
// can branch on the code instead of string-matching prose.
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, ErrorBody{Error: code, Message: message})
}

// DecodeJSON reads a JSON body with a size cap and rejects unknown fields so
// typos in client payloads surface loudly instead of being silently ignored.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

package logger

import (
	"log/slog"
	"os"
)

// New returns the process logger. Development gets human-readable text at debug
// level; production gets structured JSON at info level so logs are ingestible.
func New(env string) *slog.Logger {
	if env == "production" {
		return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		}))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
}

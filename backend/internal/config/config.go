package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds every tunable the server reads at boot. Values come from the
// environment; .env is loaded first when present so local development needs no
// shell setup.
type Config struct {
	Port string
	Env  string

	MongoURI string
	MongoDB  string

	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration

	AllowedOrigins []string

	// ICE servers handed to browsers when they join. A TURN server is optional
	// but strongly recommended in production: without one, clients behind
	// symmetric NAT cannot reach the SFU.
	STUNURLs []string
	TURNURL  string
	TURNUser string
	TURNPass string
	// TURNSecret enables time-limited TURN credentials (coturn
	// "use-auth-secret"). When set, TURNUser/TURNPass are ignored.
	TURNSecret  string
	TURNCredTTL time.Duration
	PublicIP    string
	MaxRoomSize int
}

func (c *Config) IsProduction() bool { return c.Env == "production" }

// Load reads configuration from the environment, applying development-friendly
// defaults. It returns an error rather than calling log.Fatal so the caller
// controls shutdown.
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Port:            env("PORT", "5000"),
		Env:             env("ENV", "development"),
		MongoURI:        env("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:         env("MONGO_DB", "naitri"),
		AccessTokenTTL:  envDuration("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTL: envDuration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		AllowedOrigins:  envList("ALLOWED_ORIGINS", "http://localhost:3000"),
		STUNURLs:        envList("STUN_URLS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"),
		TURNURL:         env("TURN_URL", ""),
		TURNUser:        env("TURN_USERNAME", ""),
		TURNPass:        env("TURN_PASSWORD", ""),
		TURNSecret:      env("TURN_SECRET", ""),
		TURNCredTTL:     envDuration("TURN_CREDENTIAL_TTL", 6*time.Hour),
		PublicIP:        env("PUBLIC_IP", ""),
		MaxRoomSize:     envInt("MAX_ROOM_SIZE", 25),
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// Refusing to boot without a secret in production prevents accidentally
		// shipping a server that signs tokens with a predictable key.
		if cfg.IsProduction() {
			return nil, fmt.Errorf("JWT_SECRET is required when ENV=production")
		}
		secret = "naitri-insecure-development-secret-do-not-use-in-production"
	}
	if cfg.IsProduction() && len(secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 bytes in production, got %d", len(secret))
	}
	cfg.JWTSecret = []byte(secret)

	// Static TURN credentials are handed to every signed-in user and never
	// expire, which turns the TURN server into an open relay.
	if cfg.IsProduction() && cfg.TURNURL != "" && cfg.TURNSecret == "" {
		return nil, fmt.Errorf("TURN_SECRET is required in production when TURN_URL is set; static TURN_USERNAME/TURN_PASSWORD would be exposed to every user")
	}
	if cfg.TURNCredTTL <= 0 {
		return nil, fmt.Errorf("TURN_CREDENTIAL_TTL must be positive")
	}

	if cfg.MaxRoomSize <= 0 {
		return nil, fmt.Errorf("MAX_ROOM_SIZE must be positive, got %d", cfg.MaxRoomSize)
	}

	return cfg, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envList(key, fallback string) []string {
	raw := env(key, fallback)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func envInt(key string, fallback int) int {
	v, err := strconv.Atoi(env(key, ""))
	if err != nil {
		return fallback
	}
	return v
}

func envDuration(key string, fallback time.Duration) time.Duration {
	d, err := time.ParseDuration(env(key, ""))
	if err != nil {
		return fallback
	}
	return d
}

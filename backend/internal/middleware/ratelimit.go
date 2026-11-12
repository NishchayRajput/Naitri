package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/nishchayrajput/naitri/internal/utils"
	"golang.org/x/time/rate"
)

type visitor struct {
	limiter *rate.Limiter
	seen    time.Time
}

// RateLimiter is a per-IP token bucket. It guards the auth endpoints against
// credential stuffing and signup spam.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	every    rate.Limit
	burst    int
}

func NewRateLimiter(perMinute, burst int) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		every:    rate.Every(time.Minute / time.Duration(perMinute)),
		burst:    burst,
	}
	go rl.cleanup()
	return rl
}

// cleanup evicts idle buckets so the map does not grow without bound.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.seen) > 10*time.Minute {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, ok := rl.visitors[ip]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(rl.every, rl.burst)}
		rl.visitors[ip] = v
	}
	v.seen = time.Now()
	return v.limiter.Allow()
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "60")
			utils.Error(w, http.StatusTooManyRequests,
				"rate_limited", "Too many attempts. Please wait a minute and try again.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

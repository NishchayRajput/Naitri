package utils

import "golang.org/x/crypto/bcrypt"

// bcryptCost 12 is a deliberate middle ground: ~250ms per hash on modern
// hardware. Cost 14 (the previous value) took over a second per login, which
// turns the login endpoint into a trivial CPU-exhaustion target.
const bcryptCost = 12

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(bytes), err
}

func CheckPasswordHash(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

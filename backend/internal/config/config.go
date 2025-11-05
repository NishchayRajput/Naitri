package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port      string
	Env       string
	JWTSecret string
	MongoURI  string
}

func LoadConfig() *Config {

	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	port := os.Getenv("PORT")

	if port == "" {
		log.Fatal("PORT environment variable is required")
	}

	env := os.Getenv("ENV")
	if env == "" {
		log.Fatal("ENV environment variable is required")
	}

	jwtSecret := os.Getenv("JWTSecret")
	if jwtSecret == "" {
		log.Fatal("JWTSecret environment variable is required")
	}

	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		log.Fatal("MongoURI not present")
	}

	return &Config{
		Port:      port,
		Env:       env,
		JWTSecret: jwtSecret,
		MongoURI:  mongoURI,
	}

}

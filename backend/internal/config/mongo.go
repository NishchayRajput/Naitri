package config

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var mongoClient *mongo.Client

func ConnectMongo(mongoURI string) *mongo.Client {
	if mongoClient != nil {
		return mongoClient
	}

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	if err := client.Ping(context.TODO(), nil); err != nil {
		log.Fatalf("Failed to ping MongoDB: %v", err)
	}

	log.Println("Connected to MongoDB")

	mongoClient = client
	return mongoClient
}

func DisconnectMongo() {
	if mongoClient == nil {
		return
	}
	if err := mongoClient.Disconnect(context.TODO()); err != nil {
		log.Fatalf("Failed to disconnect MongoDB client: %v", err)
	}

}

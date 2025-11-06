package repository

import (
	"context"
	"time"

	"github.com/nishchayrajput/naitri/internal/model"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type UserRepository struct {
	db *mongo.Database
}

func NewUserRepository(db *mongo.Database) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) getCollection() *mongo.Collection {
	return r.db.Collection("users")
}

func (r *UserRepository) CreateUser(user *model.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := r.getCollection().InsertOne(ctx, user)

	return err
}

func (r *UserRepository) GetUserByEmail(email string) (*model.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var user model.User
	err := r.getCollection().FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

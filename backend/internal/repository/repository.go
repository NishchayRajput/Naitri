package repository

import "go.mongodb.org/mongo-driver/v2/mongo"

type Repository struct {
	UserRepo *UserRepository
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{
		UserRepo: NewUserRepository(db),
	}
}

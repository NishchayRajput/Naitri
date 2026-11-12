package repository

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

type Repository struct {
	Users *UserRepository
	Rooms *RoomRepository
}

func New(db *mongo.Database) *Repository {
	return &Repository{
		Users: NewUserRepository(db),
		Rooms: NewRoomRepository(db),
	}
}

// EnsureIndexes is called once at boot. Index creation is idempotent, so this
// is safe to run on every start and across multiple replicas.
func (r *Repository) EnsureIndexes(ctx context.Context) error {
	if err := r.Users.EnsureIndexes(ctx); err != nil {
		return fmt.Errorf("user indexes: %w", err)
	}
	if err := r.Rooms.EnsureIndexes(ctx); err != nil {
		return fmt.Errorf("room indexes: %w", err)
	}
	return nil
}

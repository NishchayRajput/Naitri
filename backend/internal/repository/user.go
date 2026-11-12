package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/nishchayrajput/naitri/internal/model"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrDuplicateUser = errors.New("user already exists")
)

type UserRepository struct {
	col *mongo.Collection
}

func NewUserRepository(db *mongo.Database) *UserRepository {
	return &UserRepository{col: db.Collection("users")}
}

// EnsureIndexes creates the unique email index. This is what actually prevents
// duplicate accounts: a check-then-insert in the service layer races between
// two concurrent signups, the index does not.
func (r *UserRepository) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_email"),
	})
	return err
}

// NormalizeEmail lower-cases and trims so lookups and the unique index agree
// regardless of how the user typed their address.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
	now := time.Now().UTC()
	user.Email = NormalizeEmail(user.Email)
	user.CreatedAt = now
	user.UpdatedAt = now
	if user.ID.IsZero() {
		user.ID = bson.NewObjectID()
	}

	if _, err := r.col.InsertOne(ctx, user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrDuplicateUser
		}
		return err
	}
	return nil
}

func (r *UserRepository) ByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	err := r.col.FindOne(ctx, bson.M{"email": NormalizeEmail(email)}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) ByID(ctx context.Context, id string) (*model.User, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrNotFound
	}

	var user model.User
	err = r.col.FindOne(ctx, bson.M{"_id": oid}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

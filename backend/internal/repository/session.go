package repository

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ErrSessionUsed means the refresh token was already exchanged once. Seeing
// it again is the signal that the token may have been stolen.
var ErrSessionUsed = errors.New("refresh token already used")

// RefreshSession is the server-side record behind one refresh token. A JWT
// alone cannot be revoked; this record is what makes logout and theft
// detection possible.
type RefreshSession struct {
	ID        string        `bson:"_id"` // the token's jti
	Family    string        `bson:"family"`
	UserID    bson.ObjectID `bson:"userId"`
	CreatedAt time.Time     `bson:"createdAt"`
	ExpiresAt time.Time     `bson:"expiresAt"`
	UsedAt    *time.Time    `bson:"usedAt,omitempty"`
	RevokedAt *time.Time    `bson:"revokedAt,omitempty"`
}

type SessionRepository struct {
	col *mongo.Collection
}

func NewSessionRepository(db *mongo.Database) *SessionRepository {
	return &SessionRepository{col: db.Collection("refresh_sessions")}
}

func (r *SessionRepository) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			// Mongo deletes expired sessions on its own.
			Keys:    bson.D{{Key: "expiresAt", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0).SetName("ttl_expires"),
		},
		{
			Keys:    bson.D{{Key: "family", Value: 1}},
			Options: options.Index().SetName("family"),
		},
		{
			Keys:    bson.D{{Key: "userId", Value: 1}},
			Options: options.Index().SetName("user"),
		},
	})
	return err
}

func (r *SessionRepository) Create(ctx context.Context, s *RefreshSession) error {
	s.CreatedAt = time.Now().UTC()
	_, err := r.col.InsertOne(ctx, s)
	return err
}

// Consume marks a session as used, at most once. It returns ErrNotFound when
// the session does not exist, is revoked or has expired, and ErrSessionUsed
// (with the stored record) when it was already exchanged.
func (r *SessionRepository) Consume(ctx context.Context, id string) (*RefreshSession, error) {
	now := time.Now().UTC()

	var s RefreshSession
	err := r.col.FindOneAndUpdate(ctx,
		bson.M{
			"_id":       id,
			"usedAt":    bson.M{"$exists": false},
			"revokedAt": bson.M{"$exists": false},
			"expiresAt": bson.M{"$gt": now},
		},
		bson.M{"$set": bson.M{"usedAt": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&s)
	if err == nil {
		return &s, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	// Work out why the update did not match.
	if err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&s); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if s.RevokedAt == nil && s.UsedAt != nil {
		return &s, ErrSessionUsed
	}
	return nil, ErrNotFound
}

// RevokeFamily invalidates every refresh token descended from one login.
func (r *SessionRepository) RevokeFamily(ctx context.Context, family string) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateMany(ctx,
		bson.M{"family": family, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": now}},
	)
	return err
}

// RevokeUser invalidates every refresh token the user holds.
func (r *SessionRepository) RevokeUser(ctx context.Context, userID bson.ObjectID) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateMany(ctx,
		bson.M{"userId": userID, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": now}},
	)
	return err
}

// Collection exposes the underlying collection for tests.
func (r *SessionRepository) Collection() *mongo.Collection { return r.col }

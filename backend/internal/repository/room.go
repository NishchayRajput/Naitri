package repository

import (
	"context"
	"errors"
	"time"

	"github.com/nishchayrajput/naitri/internal/model"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var ErrDuplicateRoom = errors.New("room code already in use")

type RoomRepository struct {
	col *mongo.Collection
}

func NewRoomRepository(db *mongo.Database) *RoomRepository {
	return &RoomRepository{col: db.Collection("rooms")}
}

func (r *RoomRepository) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "code", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("uniq_code"),
		},
		{
			Keys:    bson.D{{Key: "hostId", Value: 1}, {Key: "createdAt", Value: -1}},
			Options: options.Index().SetName("host_recent"),
		},
	})
	return err
}

func (r *RoomRepository) Create(ctx context.Context, room *model.Room) error {
	if room.ID.IsZero() {
		room.ID = bson.NewObjectID()
	}
	room.CreatedAt = time.Now().UTC()

	if _, err := r.col.InsertOne(ctx, room); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrDuplicateRoom
		}
		return err
	}
	return nil
}

func (r *RoomRepository) ByCode(ctx context.Context, code string) (*model.Room, error) {
	var room model.Room
	err := r.col.FindOne(ctx, bson.M{"code": code}).Decode(&room)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &room, nil
}

func (r *RoomRepository) SetLocked(ctx context.Context, code string, locked bool) error {
	res, err := r.col.UpdateOne(ctx,
		bson.M{"code": code},
		bson.M{"$set": bson.M{"locked": locked}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// Ban adds a user to the room's removed list.
func (r *RoomRepository) Ban(ctx context.Context, code string, userID bson.ObjectID) error {
	res, err := r.col.UpdateOne(ctx,
		bson.M{"code": code},
		bson.M{"$addToSet": bson.M{"bannedUserIds": userID}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *RoomRepository) MarkEnded(ctx context.Context, code string) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateOne(ctx,
		bson.M{"code": code, "endedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"endedAt": now}},
	)
	return err
}

// ListByHost returns the host's most recent rooms, newest first.
func (r *RoomRepository) ListByHost(ctx context.Context, hostID bson.ObjectID, limit int64) ([]model.Room, error) {
	cur, err := r.col.Find(ctx,
		bson.M{"hostId": hostID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(limit),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	rooms := []model.Room{}
	if err := cur.All(ctx, &rooms); err != nil {
		return nil, err
	}
	return rooms, nil
}

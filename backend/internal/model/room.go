package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Room struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"-"`
	Code      string        `bson:"code"          json:"code"`
	Name      string        `bson:"name"          json:"name"`
	HostID    bson.ObjectID `bson:"hostId"        json:"-"`
	HostName  string        `bson:"hostName"      json:"hostName"`
	Locked    bool          `bson:"locked"        json:"locked"`
	CreatedAt time.Time     `bson:"createdAt"     json:"createdAt"`
	EndedAt   *time.Time    `bson:"endedAt,omitempty" json:"endedAt,omitempty"`
	// BannedUserIDs are users the host removed; they may not rejoin.
	BannedUserIDs []bson.ObjectID `bson:"bannedUserIds,omitempty" json:"-"`
}

func (r *Room) IsHost(userID bson.ObjectID) bool { return r.HostID == userID }

func (r *Room) IsBanned(userID bson.ObjectID) bool {
	for _, id := range r.BannedUserIDs {
		if id == userID {
			return true
		}
	}
	return false
}

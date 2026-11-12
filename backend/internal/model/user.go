package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Name         string        `bson:"name"          json:"name"`
	Email        string        `bson:"email"         json:"email"`
	PasswordHash string        `bson:"passwordHash"  json:"-"`
	AvatarColor  string        `bson:"avatarColor"   json:"avatarColor"`
	CreatedAt    time.Time     `bson:"createdAt"     json:"createdAt"`
	UpdatedAt    time.Time     `bson:"updatedAt"     json:"updatedAt"`
}

// PublicUser is the user shape sent to clients. It exists so a password hash
// can never leak through an accidental marshal of the full document.
type PublicUser struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	AvatarColor string `json:"avatarColor"`
}

func (u *User) Public() PublicUser {
	return PublicUser{
		ID:          u.ID.Hex(),
		Name:        u.Name,
		Email:       u.Email,
		AvatarColor: u.AvatarColor,
	}
}

package model

type User struct {
	ID        string `bson:"_id,omitempty" json:"id,omitempty"`
	Name      string `bson:"name" json:"name"`
	Email     string `bson:"email" json:"email"`
	Password  string `bson:"password" json:"-"`
	CreatedAt int64  `bson:"createdAt" json:"createdAt"`
}

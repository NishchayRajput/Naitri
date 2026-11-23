package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/nishchayrajput/naitri/internal/model"
	"github.com/nishchayrajput/naitri/internal/repository"
	"go.mongodb.org/mongo-driver/v2/bson"
)

var (
	ErrRoomNotFound = errors.New("that meeting code does not exist")
	ErrRoomEnded    = errors.New("this meeting has ended")
	ErrRoomLocked   = errors.New("this meeting is locked by the host")
	ErrNotRoomHost  = errors.New("only the host can do that")
	ErrRoomBanned   = errors.New("the host removed you from this meeting")
)

// codeAlphabet omits vowels and look-alike characters (0/o, 1/l/i) so codes
// are unambiguous when read aloud or typed from a screenshot.
const codeAlphabet = "bcdfghjkmnpqrstvwxyz23456789"

type RoomService struct {
	rooms *repository.RoomRepository
}

func NewRoomService(rooms *repository.RoomRepository) *RoomService {
	return &RoomService{rooms: rooms}
}

func (s *RoomService) Create(ctx context.Context, hostID bson.ObjectID, hostName, name string) (*model.Room, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Instant meeting"
	}
	if utf8.RuneCountInString(name) > 80 {
		return nil, fmt.Errorf("%w: meeting name is too long", ErrValidation)
	}

	// Retry on the astronomically unlikely code collision rather than failing
	// the request; the unique index is the authority.
	for attempt := 0; attempt < 5; attempt++ {
		room := &model.Room{
			Code:     generateCode(),
			Name:     name,
			HostID:   hostID,
			HostName: hostName,
		}

		err := s.rooms.Create(ctx, room)
		if err == nil {
			return room, nil
		}
		if !errors.Is(err, repository.ErrDuplicateRoom) {
			return nil, err
		}
	}
	return nil, errors.New("could not allocate a unique meeting code")
}

// Resolve looks up a room and reports whether it can currently be joined.
// The host bypasses the lock so they can always re-enter their own meeting.
func (s *RoomService) Resolve(ctx context.Context, code string, userID bson.ObjectID) (*model.Room, error) {
	room, err := s.rooms.ByCode(ctx, NormalizeCode(code))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrRoomNotFound
		}
		return nil, err
	}
	if room.EndedAt != nil {
		return nil, ErrRoomEnded
	}
	if room.IsBanned(userID) && !room.IsHost(userID) {
		return nil, ErrRoomBanned
	}
	if room.Locked && !room.IsHost(userID) {
		return nil, ErrRoomLocked
	}
	return room, nil
}

func (s *RoomService) SetLocked(ctx context.Context, code string, userID bson.ObjectID, locked bool) error {
	room, err := s.rooms.ByCode(ctx, NormalizeCode(code))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrRoomNotFound
		}
		return err
	}
	if !room.IsHost(userID) {
		return ErrNotRoomHost
	}
	return s.rooms.SetLocked(ctx, room.Code, locked)
}

// Ban records that the host removed a user, so they cannot rejoin.
func (s *RoomService) Ban(ctx context.Context, code string, userID string) error {
	oid, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return fmt.Errorf("%w: invalid user id", ErrValidation)
	}
	if err := s.rooms.Ban(ctx, NormalizeCode(code), oid); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrRoomNotFound
		}
		return err
	}
	return nil
}

func (s *RoomService) ListByHost(ctx context.Context, hostID bson.ObjectID) ([]model.Room, error) {
	return s.rooms.ListByHost(ctx, hostID, 20)
}

// NormalizeCode makes codes case- and separator-insensitive, so "ABC-DEFG-HIJ",
// "abcdefghij" and a pasted URL fragment all resolve to the same room.
func NormalizeCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(code)) {
		if strings.ContainsRune(codeAlphabet, r) {
			b.WriteRune(r)
		}
	}
	raw := b.String()
	if len(raw) != 10 {
		return raw
	}
	return raw[0:3] + "-" + raw[3:7] + "-" + raw[7:10]
}

// generateCode produces a Meet-style xxx-xxxx-xxx code from a CSPRNG.
func generateCode() string {
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing is unrecoverable and must never silently degrade
		// into a predictable code.
		panic(fmt.Sprintf("crypto/rand unavailable: %v", err))
	}
	out := make([]byte, 10)
	for i, b := range buf {
		out[i] = codeAlphabet[int(b)%len(codeAlphabet)]
	}
	return fmt.Sprintf("%s-%s-%s", out[0:3], out[3:7], out[7:10])
}

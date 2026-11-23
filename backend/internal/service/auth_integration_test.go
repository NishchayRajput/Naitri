package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nishchayrajput/naitri/internal/auth"
	"github.com/nishchayrajput/naitri/internal/repository"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// newIntegrationAuth returns an AuthService backed by a throwaway database.
// It needs a reachable MongoDB; set MONGO_TEST_URI to run it (the Makefile's
// `test-integration` target does this).
func newIntegrationAuth(t *testing.T) (*AuthService, *repository.Repository) {
	t.Helper()

	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("MONGO_TEST_URI not set; skipping MongoDB integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		t.Fatalf("ping %s: %v", uri, err)
	}

	db := client.Database("naitri_test_" + uuid.NewString()[:8])
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = client.Disconnect(ctx)
	})

	repo := repository.New(db)
	if err := repo.EnsureIndexes(ctx); err != nil {
		t.Fatalf("indexes: %v", err)
	}

	issuer := auth.NewIssuer([]byte("integration-test-secret-0123456789abcdef"), time.Minute, time.Hour)
	return NewAuthService(repo.Users, repo.Sessions, issuer), repo
}

func TestRefreshRotatesAndOldTokenStopsWorking(t *testing.T) {
	svc, repo := newIntegrationAuth(t)
	ctx := context.Background()

	first, err := svc.Signup(ctx, "Ada", "ada@example.com", "correct horse battery")
	if err != nil {
		t.Fatalf("signup: %v", err)
	}

	second, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if second.RefreshToken == first.RefreshToken {
		t.Fatal("refresh token was not rotated")
	}

	// Within the grace window a replay is treated as a benign race.
	if _, err := svc.Refresh(ctx, first.RefreshToken); !errors.Is(err, ErrRefreshSuperseded) {
		t.Fatalf("immediate replay: got %v, want ErrRefreshSuperseded", err)
	}

	// Push the rotation outside the grace window: now a replay is theft and
	// must revoke the whole login, including the newest token.
	claims, _ := auth.NewIssuer([]byte("integration-test-secret-0123456789abcdef"), time.Minute, time.Hour).
		Verify(first.RefreshToken, auth.KindRefresh)
	old := time.Now().Add(-time.Hour)
	if _, err := repo.Sessions.Collection().UpdateByID(ctx, claims.ID,
		bson.M{"$set": bson.M{"usedAt": old}}); err != nil {
		t.Fatalf("age session: %v", err)
	}

	if _, err := svc.Refresh(ctx, first.RefreshToken); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("stale replay: got %v, want ErrInvalidCredentials", err)
	}
	if _, err := svc.Refresh(ctx, second.RefreshToken); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatal("reuse of a rotated token did not revoke the rest of the family")
	}
}

func TestLogoutRevokesRefreshToken(t *testing.T) {
	svc, _ := newIntegrationAuth(t)
	ctx := context.Background()

	pair, err := svc.Signup(ctx, "Bob", "bob@example.com", "correct horse battery")
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	if err := svc.Logout(ctx, pair.RefreshToken); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("refresh after logout: got %v, want ErrInvalidCredentials", err)
	}
}

func TestLogoutEverywhereRevokesAllLogins(t *testing.T) {
	svc, _ := newIntegrationAuth(t)
	ctx := context.Background()

	a, err := svc.Signup(ctx, "Cy", "cy@example.com", "correct horse battery")
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	b, err := svc.Login(ctx, "cy@example.com", "correct horse battery")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	if err := svc.LogoutEverywhere(ctx, a.User.ID); err != nil {
		t.Fatalf("logout everywhere: %v", err)
	}
	for _, tok := range []string{a.RefreshToken, b.RefreshToken} {
		if _, err := svc.Refresh(ctx, tok); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("refresh after logout-all: got %v", err)
		}
	}
}

func TestBannedUserCannotResolveRoom(t *testing.T) {
	svc, repo := newIntegrationAuth(t)
	ctx := context.Background()
	rooms := NewRoomService(repo.Rooms)

	host, _ := svc.Signup(ctx, "Host", "host@example.com", "correct horse battery")
	guest, _ := svc.Signup(ctx, "Guest", "guest@example.com", "correct horse battery")
	hostID, _ := bson.ObjectIDFromHex(host.User.ID)
	guestID, _ := bson.ObjectIDFromHex(guest.User.ID)

	room, err := rooms.Create(ctx, hostID, "Host", "Standup")
	if err != nil {
		t.Fatalf("create room: %v", err)
	}
	if err := rooms.Ban(ctx, room.Code, guest.User.ID); err != nil {
		t.Fatalf("ban: %v", err)
	}

	if _, err := rooms.Resolve(ctx, room.Code, guestID); !errors.Is(err, ErrRoomBanned) {
		t.Fatalf("banned guest resolve: got %v, want ErrRoomBanned", err)
	}
	if _, err := rooms.Resolve(ctx, room.Code, hostID); err != nil {
		t.Fatalf("host resolve: %v", err)
	}
}

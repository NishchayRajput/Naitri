# Naitri

> Open-source video meetings. Next.js front end, Go back end, and a
> **selective forwarding unit (SFU)** built on [Pion](https://github.com/pion/webrtc)
> so each participant uploads one stream no matter how many people are in the room.

## Demo

[![Watch the Naitri demo](docs/demo/naitri-demo-poster.jpg)](docs/demo/naitri-demo.mp4)

A 1:28 narrated walkthrough: signing in, the pre-join lobby, a four-person
call with speaking indicators, chat, raised hands, screen sharing, the shared
whiteboard and host controls. Click the image to play
([`docs/demo/naitri-demo.mp4`](docs/demo/naitri-demo.mp4)).

<sub>Recorded from the real app with four browsers in one meeting. The
participants' camera feeds are stylised placeholders.</sub>

---

## Contents

- [Demo](#demo)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Quick start (development)](#quick-start-development)
- [Configuration](#configuration)
- [Running in production](#running-in-production)
- [Deployment notes](#deployment-notes)
- [HTTP API](#http-api)
- [Signaling protocol](#signaling-protocol)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## How it works

### Media topology: SFU, not mesh

In a peer-to-peer mesh every client encodes and uploads a separate copy of its
video to every other participant. At five people that is four uplinks each, and
a laptop on home broadband gives up.

Naitri routes media through a Go SFU instead. Each client holds **one**
connection to the server, which forwards RTP to everyone else.

```
  Alice ──┐                       ┌──► Alice
  Bob   ──┼──►  Go SFU (Pion)  ──┼──► Bob
  Carol ──┘                       └──► Carol

  Uplink per client:  1 stream, regardless of room size
  Server:             forwards RTP, can later record or transcribe
```

### Two peer connections per client

Each participant holds **two** `RTCPeerConnection`s, not one:

| Connection   | Who offers | Who answers | Carries                      |
| ------------ | ---------- | ----------- | ---------------------------- |
| `publisher`  | **client** | server      | your camera, mic, screen     |
| `subscriber` | **server** | client      | everyone else's media        |

Because each connection has exactly one designated offerer, **offer glare is
structurally impossible**. Neither side needs perfect-negotiation rollback,
politeness flags, or `signalingState` gymnastics — the class of bug that makes
hand-rolled WebRTC flaky simply cannot occur.

The subscriber connection opens a data channel at join time so it has at least
one m-line and connects immediately, rather than lying dormant until someone
publishes.

### Track attribution

A tile needs to know *who* a track belongs to and *what it is* (camera vs
screen). Browsers generate `MediaStream` ids themselves and offer no way to set
them, so the source cannot ride in the msid from the client. Instead:

- **client → server**: the publisher offer carries a
  `tracks: { <MediaStreamTrack.id>: "camera" | "microphone" | "screen" | "screen-audio" }`
  map, recorded *before* `SetRemoteDescription` so it is always populated by the
  time `OnTrack` fires.
- **server → client**: the SFU names the outgoing stream `<peerId>:<source>`,
  so ownership and purpose arrive atomically with the track.

### Other design choices worth knowing

- **Active-speaker detection runs client-side** (Web Audio RMS on the local mic)
  and is broadcast as presence state. It is cheaper than server-side analysis
  and more accurate, because the signal is measured pre-encode.
- **Audio playback is decoupled from video tiles.** Pinning or a layout change
  unmounts tiles; routing audio through separate sinks means that never cuts
  someone off mid-sentence.
- **Keyframes are requested on a 2s cadence** (RTCP PLI) so a late subscriber
  does not stare at a blank tile waiting for the next natural keyframe.
- **The grid searches every column count** and keeps whichever yields the
  largest 16:9 tile, instead of a fixed `grid-cols-2`.
- **RTP header extensions are stripped before forwarding.** Extension IDs are
  negotiated per connection, so the publisher's IDs mean nothing on a
  subscriber's connection. Forwarding them verbatim sends the publisher's MID,
  and browsers demux by MID — video would land on the wrong transceiver and be
  dropped silently. Each subscriber's interceptors add transport-wide CC with
  that connection's own IDs.
- **The whiteboard is shared state on the server, not a video stream.** Each
  room holds its strokes in memory on a fixed 1600×900 board, so drawings line
  up on every screen size. Strokes stream in ~50 ms chunks while being drawn, so
  others watch the line appear live; late joiners get the whole board in their
  `welcome`. Anyone can open it, draw, erase or clear; it takes the stage for
  everyone, with cameras in the filmstrip. It disappears when the room empties.
- **One accent colour, one meaning.** The UI is dark-only with a single lime
  accent that always means "live": the primary action, the speaking ring and
  the live indicator. Everything else stays quiet so video is the brightest
  thing on screen.

---

## Project layout

```
backend/
  cmd/server/            entry point: wiring + graceful shutdown
  internal/
    api/                 HTTP routes
    auth/                JWT issue + verify (typed claims, pinned algorithm)
    config/              env loading, Mongo connection
    handler/             auth, room, signaling, health handlers
    middleware/          CORS allowlist, auth, rate limit, logging, recovery
    model/               User, Room
    repository/          Mongo access + index management (users, rooms, refresh sessions)
    service/             business logic (auth, rooms, meeting codes)
    sfu/                 ★ the SFU: manager, room, peer, session, protocol, rate limits
    server/              http.Server lifecycle

frontend/
  app/                   routes: landing, /room/[code]
  components/
    auth/                sign-in / sign-up panel
    landing/             animated call preview on the home page
    meeting/             lobby, grid, tiles, control bar, panels
    shared/              logo, avatar, audio-level bars
  hooks/
    useMeeting.ts        ★ orchestrates signaling + RTC + media
    useGridLayout.ts     optimal tile packing
  lib/
    api.ts               typed client with transparent token refresh
    signaling.ts         WebSocket client with backoff + heartbeat
    rtc.ts               ★ publisher/subscriber transport
    audio.ts             mic level + speaking detection
    devices.ts           enumeration, constraints, error mapping
  types/signaling.ts     mirror of the Go wire protocol

Makefile                 setup, dev, test and build shortcuts (`make help`)
```

---

## Prerequisites

| Tool    | Version | Notes                                   |
| ------- | ------- | --------------------------------------- |
| Go      | 1.23+   | backend and SFU                         |
| Node.js | 20+     | frontend (22 recommended; pinned in `frontend/.nvmrc`) |
| MongoDB | 6+      | users and rooms (Docker compose below)  |

---

## Quick start (development)

### The short way

```bash
make setup   # installs Go + npm deps, creates backend/.env (with a random JWT_SECRET)
             # and frontend/.env.local if they do not exist yet
make dev     # starts MongoDB if nothing is on :27017, then backend :5000 + frontend :3000
```

Open **http://localhost:3000**. `Ctrl+C` stops both servers. The Makefile loads
Node through [nvm](https://github.com/nvm-sh/nvm) when it is installed, so it
works even in shells where `node` is not on `PATH`. Run `make help` for every
target.

The step-by-step version below does the same thing by hand.

### 1. Start MongoDB

```bash
docker compose up -d        # from the repo root
```

Already have Mongo running locally? Skip this and point `MONGO_URI` at it.

### 2. Backend

```bash
cd backend
cp .env.example .env        # defaults work as-is for local development
go mod download
go run ./cmd/server
```

Listens on **http://localhost:5000**. Verify:

```bash
curl localhost:5000/healthz
# {"status":"ok","rooms":0,"participants":0}
```

> In development `JWT_SECRET` may be left empty and a fixed insecure key is
> used. In production the server **refuses to boot** without a real one.

#### Live reload (optional)

```bash
go install github.com/air-verse/air@latest
cd backend && air
```

### 3. Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:5000" > .env.local
npm run dev
```

Open **http://localhost:3000**, create an account, and hit
*Start an instant meeting*.

To test a real call, open the meeting link in a **second browser profile or an
incognito window** — two tabs in the same profile share `localStorage` and would
sign in as the same person.

> **Port note:** if Next.js reports port 3000 is taken and falls back to another
> port, add that origin to `ALLOWED_ORIGINS` in `backend/.env` and restart the
> backend. The WebSocket handshake is rejected otherwise — browsers do not apply
> CORS to WebSocket upgrades, so the origin allowlist is the only check.

---

## Configuration

All backend configuration is environment driven (`backend/.env.example` is the
reference).

| Variable            | Default                    | Notes                                                    |
| ------------------- | -------------------------- | -------------------------------------------------------- |
| `PORT`              | `5000`                     | HTTP + WebSocket listen port                              |
| `ENV`               | `development`              | `production` enables strict secret checks and JSON logs   |
| `MONGO_URI`         | `mongodb://localhost:27017`|                                                           |
| `MONGO_DB`          | `naitri`                   |                                                           |
| `JWT_SECRET`        | *(dev fallback)*           | **required** in production, min 32 bytes                  |
| `ACCESS_TOKEN_TTL`  | `15m`                      | short-lived; refreshed transparently by the client        |
| `REFRESH_TOKEN_TTL` | `720h`                     | 30 days                                                   |
| `ALLOWED_ORIGINS`   | `http://localhost:3000`    | comma separated; gates **both** CORS and the WS handshake |
| `STUN_URLS`         | Google STUN                | comma separated                                           |
| `TURN_URL`          | —                          | see below — effectively required in production            |
| `TURN_SECRET`       | —                          | coturn `static-auth-secret`; **required in production** when `TURN_URL` is set |
| `TURN_CREDENTIAL_TTL` | `6h`                     | lifetime of the per-user TURN credentials                 |
| `TURN_USERNAME`     | —                          | static credentials, **local testing only** (ignored when `TURN_SECRET` is set) |
| `TURN_PASSWORD`     | —                          |                                                           |
| `PUBLIC_IP`         | —                          | set when behind 1:1 NAT (EC2/GCE/most cloud VMs)          |
| `MAX_ROOM_SIZE`     | `25`                       | participants per room                                     |

Frontend:

| Variable              | Default                 | Notes                                          |
| --------------------- | ----------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | HTTP origin; the WS URL is derived from it      |

---

## Running in production

### 1. Generate a real secret

```bash
openssl rand -base64 48
```

### 2. Build and run the backend

```bash
cd backend
go build -trimpath -ldflags="-s -w" -o bin/naitri ./cmd/server   # or: make build

ENV=production \
PORT=5000 \
JWT_SECRET='<your-generated-secret>' \
MONGO_URI='mongodb://user:pass@host:27017/?authSource=admin' \
ALLOWED_ORIGINS='https://meet.example.com' \
PUBLIC_IP='203.0.113.10' \
TURN_URL='turn:turn.example.com:3478' \
TURN_SECRET='<same value as coturn static-auth-secret>' \
./bin/naitri
```

The server handles `SIGINT`/`SIGTERM` gracefully: it notifies every connected
peer, closes their peer connections, then drains in-flight HTTP requests.

### 3. Build and run the frontend

```bash
cd frontend
NEXT_PUBLIC_API_URL=https://api.example.com npm run build
npm run start            # serves on :3000
```

`NEXT_PUBLIC_*` values are inlined at **build** time, so this must be set for
the build, not just at runtime.

### 4. systemd unit (example)

```ini
[Unit]
Description=Naitri SFU
After=network.target

[Service]
Type=simple
User=naitri
WorkingDirectory=/opt/naitri
EnvironmentFile=/opt/naitri/.env
ExecStart=/opt/naitri/bin/naitri
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Deployment notes

### HTTPS is mandatory

Browsers only expose `getUserMedia` / `getDisplayMedia` on secure origins.
`localhost` is exempt; any other host must be HTTPS or the camera silently
never appears.

### Reverse proxy must not buffer the WebSocket

```nginx
location /ws {
    proxy_pass         http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_read_timeout 3600s;   # signaling sockets are long-lived
}

location / {
    proxy_pass       http://127.0.0.1:5000;
    proxy_set_header Host $host;
}
```

### You need a TURN server

STUN alone fails for users behind symmetric NAT or strict corporate firewalls —
in practice a meaningful share of real users. Run [coturn](https://github.com/coturn/coturn):

```bash
turnserver --use-auth-secret --static-auth-secret=<secret> -r naitri \
           --no-tls --no-dtls --external-ip=<public-ip> --listening-port=3478
```

Set the same `<secret>` as `TURN_SECRET`. Naitri then mints credentials per user
in the standard TURN REST format (`username = <expiry>:<userId>`,
`password = base64(HMAC-SHA1(secret, username))`), so a credential pulled out
of a browser stops working after `TURN_CREDENTIAL_TTL` instead of turning your
TURN server into a permanent open relay.

Static `TURN_USERNAME` / `TURN_PASSWORD` still work for local testing, but every
signed-in user receives them and they never expire, so the server **refuses to
boot in production** with `TURN_URL` set and no `TURN_SECRET`. It logs a warning
on boot when `TURN_URL` is unset, and another when static credentials are used.

### UDP ports

The SFU negotiates ephemeral UDP ports for media. Allow inbound UDP to the
host, and set `PUBLIC_IP` so the SFU advertises its reachable address rather
than a private one.

### Scaling

A single SFU process is bounded by CPU and egress bandwidth. Rooms are held in
process memory, so horizontal scaling requires pinning a room to one instance
(consistent hashing on the meeting code at the load balancer). Multi-node
cascading is not implemented.

---

## HTTP API

Base path `/api/v1`. Authenticated routes take `Authorization: Bearer <accessToken>`.

| Method | Path             | Auth | Description                                 |
| ------ | ---------------- | ---- | ------------------------------------------- |
| `POST` | `/auth/signup`   | —    | Create account, returns token pair          |
| `POST` | `/auth/login`    | —    | Returns token pair                          |
| `POST` | `/auth/refresh`  | —    | Exchange refresh token for a new pair (rotates it) |
| `POST` | `/auth/logout`   | —    | Revoke the login behind a refresh token (`204`) |
| `POST` | `/auth/logout-all` | ✅ | Revoke every login the user holds (`204`)   |
| `GET`  | `/auth/me`       | ✅   | Current user; used to validate a session    |
| `POST` | `/rooms`         | ✅   | Create a meeting, returns the code          |
| `GET`  | `/rooms`         | ✅   | Rooms you host (shown as "recent rooms")    |
| `GET`  | `/rooms/{code}`  | ✅   | Resolve a code + live occupancy             |
| `GET`  | `/healthz`       | —    | Liveness + room/participant counts          |

Auth routes are rate limited per client IP (20/min, burst 10).

### Sessions and refresh tokens

Access tokens are short-lived JWTs (`ACCESS_TOKEN_TTL`, 15 min). Refresh tokens
are JWTs too, but each one is also recorded server-side in the
`refresh_sessions` collection (expired records are removed by a TTL index), which
is what makes them revocable:

- **Single use, rotated.** `/auth/refresh` marks the token used and returns a new
  pair in the same login "family".
- **Reuse detection.** Presenting an already-used token more than 30 s after it
  was rotated is treated as theft: the whole family is revoked and the caller
  gets `401 invalid_refresh_token`.
- **Multi-tab grace.** Within those 30 s the server answers
  `409 refresh_superseded` instead, because two tabs refreshing at once is
  normal. The client then picks up the pair the other tab stored.
- **Logout** revokes the family server-side; **logout-all** revokes every family
  for the user. Access tokens already issued stay valid until they expire.

Errors are machine-readable so the client can branch on the code rather than
match prose:

```json
{ "error": "room_locked", "message": "this meeting is locked by the host" }
```

Room errors: `room_not_found` (404), `room_ended` (410), `room_locked` (403),
`removed_from_room` (403 — the host removed you), `not_host` (403).

Meeting codes are `xxx-xxxx-xxx` drawn from a CSPRNG over an alphabet with no
vowels or look-alike characters (`0/o`, `1/l/i`) — unambiguous when read aloud,
and codes cannot accidentally spell words. Lookups are case- and
separator-insensitive, so a pasted URL fragment resolves fine.

---

## Signaling protocol

One WebSocket at `/ws?room=<code>&access_token=<jwt>`. The token is a query
parameter because the browser WebSocket API cannot set request headers; it is
short-lived by design, and the handshake is authenticated **before** the upgrade
so rejections come back as real HTTP status codes.

Every frame is `{ "type": "...", "payload": { ... } }`.

**Client → server**

| Type                | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `publisher-offer`   | Offer for your outgoing media (+ `tracks` map) |
| `subscriber-answer` | Answer to the server's offer              |
| `trickle`           | ICE candidate (`target`: publisher/subscriber) |
| `state`             | mic / cam / screen / hand / speaking      |
| `chat`              | Send a message                            |
| `lock`              | Host only — lock the meeting              |
| `remove-peer`       | Host only — remove (and ban) a participant |
| `board-open`        | Open / close the whiteboard for everyone  |
| `board-stroke`      | Stroke chunk: first carries tool/colour/width, later ones only points |
| `board-erase`       | Remove strokes by id (also used for undo) |
| `board-clear`       | Clear the whole board                     |
| `board-cursor`      | Your pointer position on the board (throttled, lossy) |
| `ping`              | Heartbeat                                 |

**Server → client**

| Type                | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `welcome`           | Your peer id, room, participants, ICE servers |
| `publisher-answer`  | Answer to your offer                          |
| `subscriber-offer`  | Offer for incoming media                      |
| `trickle`           | ICE candidate                                 |
| `peer-joined` / `peer-left` / `peer-state` | Presence            |
| `track-published` / `track-unpublished`    | Media lifecycle     |
| `chat`              | Broadcast message (echoed to sender)           |
| `room-locked`       | Lock state changed                             |
| `board-state`       | Whiteboard opened/closed (and by whom)         |
| `board-stroke` / `board-erase` / `board-clear` / `board-cursor` | Whiteboard updates from others |
| `removed` / `error` | `fatal: true` means do not retry               |

The Go types in `backend/internal/sfu/types.go` and the TypeScript types in
`frontend/types/signaling.ts` are mirrors — change both together.

### Limits

Every socket is rate limited (`backend/internal/sfu/limits.go`):

| Messages                              | Rate / burst | Over the limit                  |
| ------------------------------------- | ------------ | ------------------------------- |
| everything                            | 50/s, 200    | disconnected (`rate_limited`, fatal) |
| `chat`                                | 2/s, 10      | message dropped, non-fatal error |
| `state`                               | 10/s, 20     | dropped                         |
| `publisher-offer`, `subscriber-answer`| 2/s, 10      | dropped                         |
| `lock`, `remove-peer`                 | 2/s, 10      | dropped                         |
| `board-open`, `-stroke`, `-erase`, `-clear` | 40/s, 80 | dropped                      |
| `board-cursor`                        | 15/s, 30     | dropped silently                |

Chat and presence are delivered "lossy": if a recipient's send queue is full the
message is dropped for them rather than disconnecting them, so one person
flooding a room cannot knock everyone else out.

The whiteboard validates every stroke (tool, `#rrggbb` colour, width 1–48,
finite points clamped onto the board, only the author can extend a stroke) and
caps a room at 3,000 strokes / 200,000 points, 5,000 points per stroke and 500
per chunk. A full board answers `board_full` until someone clears it.

Per peer, the server also caps queued ICE candidates (64 per connection), the
track-source map (32), media sections per offer (128) and simultaneously
published tracks (8).

### Removing someone

`remove-peer` bans the **user**, not just the connection: all of their tabs are
closed and the ban is stored on the room in MongoDB, so it survives the room
emptying. Rejoining gets `403 removed_from_room` at the handshake. The host
(including the host's other tabs) cannot be removed.

---

## Security

What is in place:

- **Passwords** — bcrypt (cost 12), with timing equalised for unknown emails.
- **Tokens** — HS256 pinned, issuer checked, `kind` claim so a refresh token can
  never be used as an access token. Refresh tokens are rotated, single-use and
  revocable (see [Sessions and refresh tokens](#sessions-and-refresh-tokens)).
- **Secrets** — the server refuses to boot in production without a
  `JWT_SECRET` of at least 32 bytes, or with `TURN_URL` but no `TURN_SECRET`.
- **WebSocket** — authenticated and authorised (room exists, not locked, not
  banned) *before* the upgrade; origin allowlist via `ALLOWED_ORIGINS`.
- **Abuse limits** — HTTP auth rate limiting, per-socket signaling rate limits,
  bounded per-peer state (see [Limits](#limits)).
- **Media** — DTLS-SRTP on every leg; TURN credentials are per-user and expire.

Known gaps worth closing before a public deployment:

- The auth rate limiter keys on the TCP peer address. Behind a reverse proxy
  every user shares the proxy's IP, so add trusted `X-Forwarded-For` handling.
- Tokens are stored in `localStorage`; an httpOnly refresh cookie would shrink
  the blast radius of any future XSS.
- The access token travels in the WebSocket URL; make sure your proxy does not
  log query strings.
- Never set `ALLOWED_ORIGINS=*` in production.
- No security headers (CSP, HSTS, frame-ancestors) are set yet.

---

## Testing

```bash
make test               # all of the below
make test-backend       # go vet + unit and end-to-end SFU tests, race detector on
make test-integration   # tests that need MongoDB (refresh rotation, logout, bans)
make test-frontend      # TypeScript type check + ESLint
make build              # production builds of both halves
```

The MongoDB-backed tests run only when `MONGO_TEST_URI` is set (the Makefile sets
it to `mongodb://127.0.0.1:27017`). Each run uses a throwaway `naitri_test_*`
database and drops it afterwards.

The SFU suite (`internal/sfu/sfu_test.go`) stands up a real server and connects
**two Pion clients** over actual peer connections. It asserts that media
published by one peer is received by the other and that RTP payload genuinely
flows — not merely that SDP was exchanged. It also covers late joiners
subscribing to existing tracks, room capacity limits, chat broadcast and
departure notifications.

`internal/sfu/security_test.go` covers the abuse limits end to end: a client
flooding chat is disconnected without affecting anyone else, a removed user
cannot rejoin, the host cannot be removed, TURN credentials are time-limited and
static ones are never handed out when a secret is set.
`internal/sfu/board_test.go` covers whiteboard validation, stroke ownership,
capacity limits and erase, plus an end-to-end run where strokes stream between
peers, a late joiner receives the board and a clear reaches everyone.
`internal/sfu/forward_ext_test.go` guards the header-extension stripping
described above — Pion test clients do not demux by MID the way browsers do, so
without it this bug is invisible to the rest of the suite.

`internal/middleware/observability_test.go` guards two regressions that are
invisible at the unit level and break the whole app in a browser: a response
wrapper that drops `http.Hijacker` (every WebSocket handshake 500s), and CORS
preflights falling through to the 404 handler.

---

## Troubleshooting

**Backend exits with `room indexes: ... E11000 duplicate key ... { code: null }`**
The `rooms` collection holds documents from an older schema with no `code`
field, so the unique index cannot be built. Back them up and remove them:

```bash
mongosh naitri --eval 'printjson(db.rooms.find({code: {$exists: false}}).toArray())' > legacy-rooms.json
mongosh naitri --eval 'printjson(db.rooms.deleteMany({code: {$exists: false}}))'
```

**Backend exits with `JWT_SECRET is required` / `TURN_SECRET is required`**
You are running with `ENV=production`. Set the variable (see
[Configuration](#configuration)); the key is `JWT_SECRET` with an underscore.

**`listen tcp :5000: bind: address already in use`**
Another backend is already running — often a previous `make dev`. Stop it, or
set `PORT`.

**Everyone was signed out after upgrading**
Expected once: refresh tokens issued before server-side sessions existed cannot
be revoked, so they are no longer accepted.

**`node: command not found` in scripts**
Node is installed through nvm, which only loads in interactive shells. Use the
Makefile targets, or run `source ~/.nvm/nvm.sh && nvm use` first.

**WebSocket handshake fails with 401**
The access token expired or is missing. The client refreshes before dialling;
if it persists, check that the frontend and backend agree on `JWT_SECRET`.

**WebSocket handshake fails, nothing in the backend log**
The origin is not in `ALLOWED_ORIGINS`. Browsers do not apply CORS to WebSocket
upgrades, so this allowlist is the only protection — and the most common cause
is Next.js having fallen back to a different port.

**Camera works locally but nobody can see anyone**
ICE is failing. Configure TURN, set `PUBLIC_IP`, and confirm inbound UDP is
open. `chrome://webrtc-internals` shows whether candidate pairs ever succeed.

**"Could not access your camera or microphone"**
Either permission was denied (re-grant via the address bar), the device is
claimed by another app, or the page is not on a secure origin.

**Tiles stay black with video seemingly connected**
Usually a missing keyframe. The SFU requests one every 2s; if it persists,
check for packet loss on the publisher's uplink. In
`chrome://webrtc-internals`, an `inbound-rtp` video entry with packets but no
decoded frames points at keyframes; no `inbound-rtp` video entry at all means
packets are not reaching the transceiver (see the header-extension note in
[How it works](#how-it-works)).

**"You were removed from this meeting" when joining**
The host removed this account earlier. Bans are per room and stored in MongoDB
(`bannedUserIds` on the room document).

---

## Contributing

Please reach out before opening a pull request — contact details are in my
[GitHub bio](https://github.com/nishchayrajput). Let's align on the plan first
so the project stays coherent.

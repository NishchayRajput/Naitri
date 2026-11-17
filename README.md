# Naitri

> Open-source video meetings. Next.js front end, Go back end, and a
> **selective forwarding unit (SFU)** built on [Pion](https://github.com/pion/webrtc)
> so each participant uploads one stream no matter how many people are in the room.

---

## Contents

- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Quick start (development)](#quick-start-development)
- [Configuration](#configuration)
- [Running in production](#running-in-production)
- [Deployment notes](#deployment-notes)
- [HTTP API](#http-api)
- [Signaling protocol](#signaling-protocol)
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
    repository/          Mongo access + index management
    service/             business logic (auth, rooms, meeting codes)
    sfu/                 ★ the SFU: manager, room, peer, session, protocol
    server/              http.Server lifecycle

frontend/
  app/                   routes: landing, /room/[code]
  components/
    auth/                sign-in / sign-up panel
    meeting/             lobby, grid, tiles, control bar, panels
    shared/              logo, avatar
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
```

---

## Prerequisites

| Tool    | Version | Notes                                   |
| ------- | ------- | --------------------------------------- |
| Go      | 1.23+   | backend and SFU                         |
| Node.js | 20+     | frontend                                |
| MongoDB | 6+      | users and rooms (Docker compose below)  |

---

## Quick start (development)

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
| `TURN_USERNAME`     | —                          |                                                           |
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
go build -trimpath -ldflags="-s -w" -o bin/naitri ./cmd/server

ENV=production \
PORT=5000 \
JWT_SECRET='<your-generated-secret>' \
MONGO_URI='mongodb://user:pass@host:27017/?authSource=admin' \
ALLOWED_ORIGINS='https://meet.example.com' \
PUBLIC_IP='203.0.113.10' \
TURN_URL='turn:turn.example.com:3478' \
TURN_USERNAME='naitri' \
TURN_PASSWORD='<turn-secret>' \
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
turnserver -a -u naitri:<secret> -r naitri --no-tls --no-dtls \
           --external-ip=<public-ip> --listening-port=3478
```

The server logs a warning on boot when `TURN_URL` is unset.

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
| `POST` | `/auth/refresh`  | —    | Exchange refresh token for a new pair       |
| `GET`  | `/auth/me`       | ✅   | Current user; used to validate a session    |
| `POST` | `/rooms`         | ✅   | Create a meeting, returns the code          |
| `GET`  | `/rooms`         | ✅   | Rooms you host                              |
| `GET`  | `/rooms/{code}`  | ✅   | Resolve a code + live occupancy             |
| `GET`  | `/healthz`       | —    | Liveness + room/participant counts          |

Errors are machine-readable so the client can branch on the code rather than
match prose:

```json
{ "error": "room_locked", "message": "this meeting is locked by the host" }
```

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
| `remove-peer`       | Host only — remove a participant          |
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
| `removed` / `error` | `fatal: true` means do not retry               |

The Go types in `backend/internal/sfu/types.go` and the TypeScript types in
`frontend/types/signaling.ts` are mirrors — change both together.

---

## Testing

```bash
# Backend: unit + end-to-end SFU tests, race detector on
cd backend && go test -race ./...

# Frontend: type check and production build
cd frontend && npx tsc --noEmit && npm run build
```

The SFU suite (`internal/sfu/sfu_test.go`) stands up a real server and connects
**two Pion clients** over actual peer connections. It asserts that media
published by one peer is received by the other and that RTP payload genuinely
flows — not merely that SDP was exchanged. It also covers late joiners
subscribing to existing tracks, room capacity limits, chat broadcast and
departure notifications.

`internal/middleware/observability_test.go` guards two regressions that are
invisible at the unit level and break the whole app in a browser: a response
wrapper that drops `http.Hijacker` (every WebSocket handshake 500s), and CORS
preflights falling through to the 404 handler.

---

## Troubleshooting

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
check for packet loss on the publisher's uplink.

---

## Contributing

Please reach out before opening a pull request — contact details are in my
[GitHub bio](https://github.com/nishchayrajput). Let's align on the plan first
so the project stays coherent.

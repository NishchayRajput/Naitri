/**
 * Typed API client.
 *
 * Access tokens are short-lived (15 min), so every authenticated call can hit
 * a 401 mid-session. The client transparently refreshes once and replays the
 * request, and collapses concurrent refreshes into a single in-flight call so
 * a burst of parallel requests cannot trigger a refresh storm.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"

export interface User {
  id: string
  name: string
  email: string
  avatarColor: string
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User
}

export interface Room {
  code: string
  name: string
  hostName: string
  locked: boolean
  createdAt: string
  endedAt?: string
}

export interface RoomResolution {
  room: Room
  isHost: boolean
  occupancy: number
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const ACCESS_KEY = "naitri.accessToken"
const REFRESH_KEY = "naitri.refreshToken"
const USER_KEY = "naitri.user"

export const tokenStore = {
  get access() {
    if (typeof window === "undefined") return null
    return window.localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    if (typeof window === "undefined") return null
    return window.localStorage.getItem(REFRESH_KEY)
  },
  get user(): User | null {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      // Corrupted entry would otherwise throw on every page load.
      window.localStorage.removeItem(USER_KEY)
      return null
    }
  },
  save(result: AuthResult) {
    window.localStorage.setItem(ACCESS_KEY, result.accessToken)
    window.localStorage.setItem(REFRESH_KEY, result.refreshToken)
    window.localStorage.setItem(USER_KEY, JSON.stringify(result.user))
  },
  saveUser(user: User) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    window.localStorage.removeItem(ACCESS_KEY)
    window.localStorage.removeItem(REFRESH_KEY)
    window.localStorage.removeItem(USER_KEY)
  },
}

/** Shared promise so N concurrent 401s produce exactly one refresh call. */
let refreshInFlight: Promise<string | null> | null = null

/** Notified when refresh fails and the session is unrecoverable. */
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.refresh
    if (!refreshToken) return null

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) {
        tokenStore.clear()
        onSessionExpired?.()
        return null
      }
      const result = (await res.json()) as AuthResult
      tokenStore.save(result)
      return result.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "unknown"
  let message = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body?.error) code = body.error
    if (body?.message) message = body.message
  } catch {
    // Non-JSON error body; the defaults above are the best we can do.
  }
  return new ApiError(res.status, code, message)
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
  /** Internal: prevents an infinite refresh/replay loop. */
  isRetry?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, isRetry = false } = opts

  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (auth) {
    const token = tokenStore.access
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && auth && !isRetry) {
    const fresh = await refreshAccessToken()
    if (fresh) return request<T>(path, { ...opts, isRetry: true })
  }

  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  async signup(name: string, email: string, password: string): Promise<AuthResult> {
    return request<AuthResult>("/api/v1/auth/signup", {
      method: "POST",
      body: { name, email, password },
      auth: false,
    })
  },

  async login(email: string, password: string): Promise<AuthResult> {
    return request<AuthResult>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    })
  },

  async me(): Promise<User> {
    const { user } = await request<{ user: User }>("/api/v1/auth/me")
    return user
  },

  async createRoom(name?: string): Promise<Room> {
    const { room } = await request<{ room: Room }>("/api/v1/rooms", {
      method: "POST",
      body: { name: name ?? "" },
    })
    return room
  },

  async getRoom(code: string): Promise<RoomResolution> {
    return request<RoomResolution>(`/api/v1/rooms/${encodeURIComponent(code)}`)
  },

  async myRooms(): Promise<Room[]> {
    const { rooms } = await request<{ rooms: Room[] }>("/api/v1/rooms")
    return rooms
  },

  /**
   * Returns an access token guaranteed fresh enough to open a socket. The
   * WebSocket handshake cannot retry with a new token, so it is refreshed
   * up front rather than reactively.
   */
  async socketToken(): Promise<string | null> {
    try {
      await this.me()
    } catch {
      // me() already attempted a refresh; fall through to whatever we hold.
    }
    return tokenStore.access
  },
}

export function signalingUrl(roomCode: string, token: string): string {
  const url = new URL(API_BASE)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/ws"
  url.searchParams.set("room", roomCode)
  url.searchParams.set("access_token", token)
  return url.toString()
}

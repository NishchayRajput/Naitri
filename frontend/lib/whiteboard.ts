/**
 * Shared whiteboard state.
 *
 * The store is framework-agnostic: the meeting hook feeds it server messages,
 * the canvas component subscribes and redraws. Keeping it outside React means
 * a stream of drawing points never triggers a React render per point.
 *
 * Coordinates are in board units (BOARD_WIDTH x BOARD_HEIGHT), the same on
 * every screen. Local strokes are drawn immediately and streamed to the server
 * in small chunks, so other people watch the line appear as it is drawn.
 */

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardSnapshot,
  type BoardTool,
  type ClientMessage,
  type Stroke,
  type StrokeChunk,
} from "@/types/signaling"

export interface RemoteCursor {
  peerId: string
  x: number
  y: number
  at: number
}

/** How often an in-progress stroke is flushed to the server. */
const FLUSH_MS = 50
/** Server caps (see backend/internal/sfu/board.go). */
const MAX_CHUNK_PAIRS = 480
const MAX_STROKE_PAIRS = 4900
/** Points closer than this to the previous one add nothing visible. */
const MIN_POINT_DISTANCE = 1.2
const CURSOR_INTERVAL_MS = 70

function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const clampX = (x: number) => Math.max(0, Math.min(BOARD_WIDTH, x))
const clampY = (y: number) => Math.max(0, Math.min(BOARD_HEIGHT, y))

interface LocalStroke {
  stroke: Stroke
  pending: number[]
  announced: boolean
}

export class BoardStore {
  /** Insertion-ordered, which is also drawing order. */
  readonly strokes = new Map<string, Stroke>()
  readonly cursors = new Map<string, RemoteCursor>()
  /** Bumped on every change, so subscribers can cheaply tell what is stale. */
  version = 0

  private listeners = new Set<() => void>()
  private send: (msg: ClientMessage) => void
  private selfPeerId = "self"

  private active: LocalStroke | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  /** Our own strokes, newest last, for undo. */
  private mine: string[] = []

  private lastCursorSent = 0
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private queuedCursor: { x: number; y: number; active: boolean } | null = null

  constructor(send: (msg: ClientMessage) => void) {
    this.send = send
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private changed() {
    this.version++
    this.listeners.forEach((fn) => fn())
  }

  setSelf(peerId: string) {
    this.selfPeerId = peerId
  }

  /* ------------------------------------------------------- from the server */

  /** Replaces the board with the server's snapshot (join or reconnect). */
  reset(snapshot: BoardSnapshot | undefined) {
    this.cancelActive()
    this.strokes.clear()
    this.cursors.clear()
    for (const s of snapshot?.strokes ?? []) this.strokes.set(s.id, s)
    this.mine = this.mine.filter((id) => this.strokes.has(id))
    this.changed()
  }

  applyChunk(chunk: StrokeChunk) {
    const existing = this.strokes.get(chunk.id)
    if (existing) {
      existing.points.push(...chunk.points)
      existing.done = chunk.done
    } else if (chunk.tool && chunk.color && chunk.width) {
      this.strokes.set(chunk.id, {
        id: chunk.id,
        peerId: chunk.peerId ?? "",
        tool: chunk.tool,
        color: chunk.color,
        width: chunk.width,
        points: [...chunk.points],
        done: chunk.done,
      })
    }
    this.changed()
  }

  applyErase(ids: string[]) {
    let any = false
    for (const id of ids) any = this.strokes.delete(id) || any
    if (any) this.changed()
  }

  applyClear() {
    this.cancelActive()
    this.strokes.clear()
    this.mine = []
    this.changed()
  }

  applyCursor(c: { peerId: string; x: number; y: number; active: boolean }) {
    if (c.active) this.cursors.set(c.peerId, { peerId: c.peerId, x: c.x, y: c.y, at: Date.now() })
    else this.cursors.delete(c.peerId)
    this.changed()
  }

  removePeer(peerId: string) {
    if (this.cursors.delete(peerId)) this.changed()
  }

  /* ------------------------------------------------------------- local ops */

  beginStroke(tool: BoardTool, color: string, width: number, x: number, y: number) {
    this.endStroke()

    const stroke: Stroke = {
      id: newId(),
      peerId: this.selfPeerId,
      tool,
      color,
      width,
      points: [clampX(x), clampY(y)],
      done: false,
    }
    this.strokes.set(stroke.id, stroke)
    this.mine.push(stroke.id)
    this.active = { stroke, pending: [...stroke.points], announced: false }
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS)
    this.changed()
  }

  extendStroke(x: number, y: number) {
    const a = this.active
    if (!a) return
    x = clampX(x)
    y = clampY(y)

    const pts = a.stroke.points
    const dx = x - pts[pts.length - 2]
    const dy = y - pts[pts.length - 1]
    if (dx * dx + dy * dy < MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) return

    pts.push(x, y)
    a.pending.push(x, y)

    if (a.pending.length / 2 >= MAX_CHUNK_PAIRS) this.flush()

    // A very long scribble is split into consecutive strokes so it never hits
    // the server's per-stroke cap; visually it is one continuous line.
    if (pts.length / 2 >= MAX_STROKE_PAIRS) {
      const { tool, color, width } = a.stroke
      this.endStroke()
      this.beginStroke(tool, color, width, x, y)
      return
    }
    this.changed()
  }

  endStroke() {
    const a = this.active
    if (!a) return
    a.stroke.done = true
    this.flush(true)
    this.stopTimer()
    this.active = null
    this.changed()
  }

  private flush(done = false) {
    const a = this.active
    if (!a) return
    if (a.pending.length === 0 && !done) return

    const chunk: StrokeChunk = a.announced
      ? { id: a.stroke.id, points: a.pending, done }
      : {
          id: a.stroke.id,
          tool: a.stroke.tool,
          color: a.stroke.color,
          width: a.stroke.width,
          points: a.pending,
          done,
        }
    this.send({ type: "board-stroke", payload: chunk })
    a.announced = true
    a.pending = []
  }

  private stopTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = null
  }

  private cancelActive() {
    this.stopTimer()
    this.active = null
  }

  /** Strokes whose ink passes within `radius` of (x, y). */
  hitTest(x: number, y: number, radius: number): string[] {
    const hits: string[] = []
    for (const s of this.strokes.values()) {
      const reach = radius + (s.tool === "highlighter" ? s.width * 1.5 : s.width / 2)
      const p = s.points
      if (p.length === 2) {
        if (Math.hypot(p[0] - x, p[1] - y) <= reach) hits.push(s.id)
        continue
      }
      for (let i = 0; i + 3 < p.length; i += 2) {
        if (segmentDistance(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) {
          hits.push(s.id)
          break
        }
      }
    }
    return hits
  }

  erase(ids: string[]) {
    const existing = ids.filter((id) => this.strokes.has(id))
    if (existing.length === 0) return
    for (const id of existing) this.strokes.delete(id)
    // Server caps one erase message at 200 ids.
    for (let i = 0; i < existing.length; i += 200) {
      this.send({ type: "board-erase", payload: { ids: existing.slice(i, i + 200) } })
    }
    this.changed()
  }

  /** Removes your own most recent stroke that is still on the board. */
  undo(): boolean {
    while (this.mine.length > 0) {
      const id = this.mine.pop()!
      if (this.strokes.has(id)) {
        this.erase([id])
        return true
      }
    }
    return false
  }

  canUndo(): boolean {
    return this.mine.some((id) => this.strokes.has(id))
  }

  clear() {
    this.applyClear()
    this.send({ type: "board-clear" })
  }

  /** Sends our pointer position, throttled; the latest position always wins. */
  sendCursor(x: number, y: number, active: boolean) {
    this.queuedCursor = { x: Math.round(clampX(x)), y: Math.round(clampY(y)), active }
    const wait = CURSOR_INTERVAL_MS - (Date.now() - this.lastCursorSent)

    // Leaving the board is sent at once so cursors never linger.
    if (!active || wait <= 0) {
      this.flushCursor()
      return
    }
    if (!this.cursorTimer) this.cursorTimer = setTimeout(() => this.flushCursor(), wait)
  }

  private flushCursor() {
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.cursorTimer = null
    const c = this.queuedCursor
    if (!c) return
    this.queuedCursor = null
    this.lastCursorSent = Date.now()
    this.send({ type: "board-cursor", payload: c })
  }

  dispose() {
    this.cancelActive()
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.listeners.clear()
  }
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/* ---------------------------------------------------------------- drawing */

export const BOARD_BACKGROUND = "#f7f7f3"

/**
 * Draws one stroke with midpoint-quadratic smoothing, which turns the jagged
 * polyline of sampled pointer positions into a natural curve.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.points
  if (p.length < 2) return

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  let width = s.width
  if (s.tool === "highlighter") {
    ctx.globalAlpha = 0.42
    width = s.width * 3
    ctx.globalCompositeOperation = "multiply"
  }
  ctx.lineWidth = width

  if (p.length === 2) {
    ctx.beginPath()
    ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  ctx.beginPath()
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i + 3 < p.length; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2
    const my = (p[i + 1] + p[i + 3]) / 2
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my)
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1])
  ctx.stroke()
  ctx.restore()
}

/** Faint dot grid, drawn in board units. */
export function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.fillStyle = "rgba(15, 23, 42, 0.13)"
  for (let x = 40; x < BOARD_WIDTH; x += 40) {
    for (let y = 40; y < BOARD_HEIGHT; y += 40) {
      ctx.fillRect(x - 1, y - 1, 2, 2)
    }
  }
  ctx.restore()
}

/** Renders the board to a PNG data URL at full board resolution. */
export function exportBoardPng(store: BoardStore, scale = 1): string {
  const canvas = document.createElement("canvas")
  canvas.width = BOARD_WIDTH * scale
  canvas.height = BOARD_HEIGHT * scale
  const ctx = canvas.getContext("2d")!
  ctx.scale(scale, scale)
  ctx.fillStyle = BOARD_BACKGROUND
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  for (const s of store.strokes.values()) drawStroke(ctx, s)
  return canvas.toDataURL("image/png")
}

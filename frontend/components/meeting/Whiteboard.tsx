"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  BOARD_BACKGROUND, drawGrid, drawStroke, exportBoardPng, type BoardStore, type RemoteCursor,
} from "@/lib/whiteboard"
import { BOARD_HEIGHT, BOARD_WIDTH, type BoardTool } from "@/types/signaling"
import {
  Download, Eraser, Highlighter, PenLine, Trash2, Undo2, X,
} from "lucide-react"

type Tool = BoardTool | "eraser"

const COLORS = [
  { value: "#111827", label: "Ink" },
  { value: "#e11d48", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
]
const SIZES = [
  { value: 3, label: "Thin" },
  { value: 6, label: "Medium" },
  { value: 12, label: "Thick" },
]
const ERASER_RADIUS = 14
const MOBILE_BREAKPOINT = 640
// Two wrapped toolbar rows plus a gap.
const TOOLBAR_RESERVE = 92
/** Remote cursors fade out after this long without movement. */
const CURSOR_TTL_MS = 4000

export interface BoardPeer {
  name: string
  color: string
}

export function Whiteboard({
  store,
  peers,
  roomCode,
  notice,
  onClose,
}: {
  store: BoardStore
  peers: Map<string, BoardPeer>
  roomCode: string
  notice?: string | null
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const [tool, setTool] = useState<Tool>("pen")
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(SIZES[1].value)
  const [confirmClear, setConfirmClear] = useState(false)
  const [cursors, setCursors] = useState<RemoteCursor[]>([])
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(store.strokes.size === 0)
  const [canUndo, setCanUndo] = useState(store.canUndo())

  const drawingRef = useRef(false)
  const lastEraseRef = useRef<{ x: number; y: number } | null>(null)

  /* ---------------------------------------------------------------- sizing */

  // Fit the 16:9 board inside whatever space the stage gives it.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const cw = el.clientWidth
      // On phones the toolbar sits above the board rather than over it.
      const ch = el.clientHeight - (cw < MOBILE_BREAKPOINT ? TOOLBAR_RESERVE : 0)
      const w = Math.min(cw, (Math.max(0, ch) * BOARD_WIDTH) / BOARD_HEIGHT)
      setSize({ w: Math.floor(w), h: Math.floor((w * BOARD_HEIGHT) / BOARD_WIDTH) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* -------------------------------------------------------------- painting */

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    const pxW = Math.round(size.w * dpr)
    const pxH = Math.round(size.h * dpr)
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW
      canvas.height = pxH
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Draw in board units; the transform maps them onto device pixels.
    ctx.setTransform(pxW / BOARD_WIDTH, 0, 0, pxH / BOARD_HEIGHT, 0, 0)
    ctx.fillStyle = BOARD_BACKGROUND
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
    drawGrid(ctx)
    for (const s of store.strokes.values()) drawStroke(ctx, s)
  }, [store, size])

  // Coalesce store changes into at most one paint per animation frame.
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        paint()
        setEmpty(store.strokes.size === 0)
        setCanUndo(store.canUndo())
        setCursors((prev) => {
          const next = Array.from(store.cursors.values())
          const same =
            prev.length === next.length &&
            prev.every((c, i) => c.peerId === next[i].peerId && c.x === next[i].x && c.y === next[i].y)
          return same ? prev : next
        })
      })
    }
    schedule()
    const unsubscribe = store.subscribe(schedule)
    return () => {
      unsubscribe()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [store, paint])

  // Re-render periodically so idle cursors fade out.
  const [, setNow] = useState(0)
  useEffect(() => {
    if (cursors.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [cursors.length])

  /* --------------------------------------------------------------- input */

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    }
  }

  // Pointer events arrive at intervals, so a fast swipe can jump straight
  // over a stroke. Sample along the path from the previous position instead
  // of only testing where events happened to land.
  const eraseAt = (x: number, y: number) => {
    const from = lastEraseRef.current ?? { x, y }
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (ERASER_RADIUS / 2)))
    const hits = new Set<string>()
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      for (const id of store.hitTest(from.x + (x - from.x) * t, from.y + (y - from.y) * t, ERASER_RADIUS)) {
        hits.add(id)
      }
    }
    lastEraseRef.current = { x, y }
    if (hits.size) store.erase([...hits])
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const { x, y } = toBoard(e)
    lastEraseRef.current = null
    if (tool === "eraser") eraseAt(x, y)
    else store.beginStroke(tool, color, width, x, y)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toBoard(e)
    store.sendCursor(x, y, true)
    if (tool === "eraser") setEraserAt({ x, y })
    if (!drawingRef.current) return

    // Coalesced events recover the samples the browser merged between frames,
    // which is the difference between a smooth curve and a polygon.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toBoard(ev)
      if (tool === "eraser") eraseAt(p.x, p.y)
      else store.extendStroke(p.x, p.y)
    }
  }

  const finish = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastEraseRef.current = null
    store.endStroke()
  }

  const onPointerLeave = () => {
    setEraserAt(null)
    if (!drawingRef.current) store.sendCursor(0, 0, false)
  }

  /* ------------------------------------------------------------ shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        store.undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === "p") setTool("pen")
      else if (k === "h") setTool("highlighter")
      else if (k === "e") setTool("eraser")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [store])

  // Leaving the board (closing it) should not leave our cursor on others' screens.
  useEffect(() => () => store.sendCursor(0, 0, false), [store])

  const download = () => {
    const a = document.createElement("a")
    a.href = exportBoardPng(store, 2)
    a.download = `naitri-whiteboard-${roomCode}.png`
    a.click()
  }

  const now = Date.now()
  const liveCursors = cursors.filter((c) => now - c.at < CURSOR_TTL_MS && peers.has(c.peerId))

  return (
    <div
      ref={containerRef}
      className="relative flex size-full items-center justify-center max-sm:items-end max-sm:pb-1"
    >
      <div className="relative" style={{ width: size.w, height: size.h }}>
      <div className="absolute inset-0 overflow-hidden rounded-[22px] shadow-float ring-1 ring-white/10 animate-pop">
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 size-full touch-none select-none",
            tool === "eraser" ? "cursor-none" : "cursor-crosshair",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={onPointerLeave}
          aria-label="Shared whiteboard"
          role="img"
        />

        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-center text-slate-400">
              <PenLine className="size-7" />
              <p className="text-[15px] font-medium text-slate-500">Draw anything</p>
              <p className="text-[12px]">Everyone in the meeting sees it live</p>
            </div>
          </div>
        )}

        {/* Eraser footprint */}
        {tool === "eraser" && eraserAt && (
          <span
            className="pointer-events-none absolute rounded-full border-2 border-slate-500/70 bg-white/40"
            style={{
              left: `${(eraserAt.x / BOARD_WIDTH) * 100}%`,
              top: `${(eraserAt.y / BOARD_HEIGHT) * 100}%`,
              width: (ERASER_RADIUS * 2 * size.w) / BOARD_WIDTH,
              height: (ERASER_RADIUS * 2 * size.w) / BOARD_WIDTH,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}

        {/* Other people's cursors */}
        {liveCursors.map((c) => {
          const peer = peers.get(c.peerId)!
          return (
            <div
              key={c.peerId}
              className="pointer-events-none absolute left-0 top-0 transition-transform duration-100 ease-linear"
              style={{
                transform: `translate(${(c.x / BOARD_WIDTH) * size.w}px, ${(c.y / BOARD_HEIGHT) * size.h}px)`,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow" aria-hidden>
                <path d="M2 1.5 15.5 8 9 9.6 6.4 16Z" fill={peer.color} stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span
                className="ml-3 -mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow"
                style={{ background: peer.color }}
              >
                {peer.name}
              </span>
            </div>
          )
        })}

        {notice && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <span className="rounded-full bg-[#14161a]/90 px-4 py-2 text-[13px] font-medium text-white shadow-float animate-rise">
              {notice}
            </span>
          </div>
        )}
      </div>

        {/* Toolbar: floats over the board on wide screens, sits above it on
            phones so it never hides what is being drawn. */}
        <div className="absolute inset-x-0 bottom-[calc(100%+8px)] flex justify-center sm:bottom-auto sm:top-3 sm:px-3">
          <div className="no-scrollbar flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl sm:flex-nowrap sm:overflow-x-auto bg-[#14161a]/90 p-1 shadow-float ring-1 ring-white/10 backdrop-blur-xl sm:gap-1 sm:p-1.5">
            <ToolButton label="Pen (P)" active={tool === "pen"} onClick={() => setTool("pen")}>
              <PenLine />
            </ToolButton>
            <ToolButton label="Highlighter (H)" active={tool === "highlighter"} onClick={() => setTool("highlighter")}>
              <Highlighter />
            </ToolButton>
            <ToolButton label="Eraser (E)" active={tool === "eraser"} onClick={() => setTool("eraser")}>
              <Eraser />
            </ToolButton>

            {tool !== "eraser" && (
              <>
                <Sep />
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    aria-label={c.label}
                    title={c.label}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 sm:size-8",
                      color === c.value && "ring-2 ring-brand ring-offset-2 ring-offset-[#14161a]",
                    )}
                  >
                    <span
                      className="size-5 rounded-full ring-1 ring-white/25"
                      style={{ background: c.value }}
                    />
                  </button>
                ))}
                <Sep />
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setWidth(s.value)}
                    aria-label={s.label}
                    title={s.label}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-xl transition-colors sm:size-8",
                      width === s.value ? "bg-white/12" : "hover:bg-white/8",
                    )}
                  >
                    <span
                      className="rounded-full bg-white"
                      style={{ width: 3 + s.value * 0.9, height: 3 + s.value * 0.9 }}
                    />
                  </button>
                ))}
              </>
            )}

            <Sep />
            <ToolButton label="Undo (Ctrl+Z)" onClick={() => store.undo()} disabled={!canUndo}>
              <Undo2 />
            </ToolButton>
            {confirmClear ? (
              <button
                type="button"
                onClick={() => {
                  store.clear()
                  setConfirmClear(false)
                }}
                onBlur={() => setConfirmClear(false)}
                autoFocus
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-destructive px-3 text-[12px] font-semibold text-white"
              >
                <Trash2 className="size-4" />
                Clear for everyone?
              </button>
            ) : (
              <ToolButton label="Clear board" onClick={() => setConfirmClear(true)} disabled={empty}>
                <Trash2 />
              </ToolButton>
            )}
            <ToolButton label="Download PNG" onClick={download} disabled={empty}>
              <Download />
            </ToolButton>
            <Sep />
            <ToolButton label="Close whiteboard" onClick={onClose}>
              <X />
            </ToolButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolButton({
  label, active, disabled, onClick, children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-xl transition-colors [&_svg]:size-[17px] disabled:opacity-35 sm:size-9 sm:[&_svg]:size-[18px]",
        active ? "bg-brand text-brand-ink" : "text-white/85 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-white/12" />
}

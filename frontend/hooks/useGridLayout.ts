"use client"

import { useEffect, useMemo, useRef, useState } from "react"

interface Size {
  width: number
  height: number
}

export interface GridLayout {
  columns: number
  rows: number
  tileWidth: number
  tileHeight: number
}

/**
 * Picks the tile grid that maximises tile area for a given container.
 *
 * A fixed column count (the usual `grid-cols-2`) wastes most of a wide screen
 * at 3 participants and squashes tiles at 7. Searching every column count and
 * keeping the one that yields the largest 16:9 tile is what makes the grid
 * feel designed rather than arbitrary.
 */
export function computeGridLayout(count: number, size: Size, aspect = 16 / 9, gap = 12): GridLayout {
  if (count === 0 || size.width === 0 || size.height === 0) {
    return { columns: 1, rows: 1, tileWidth: 0, tileHeight: 0 }
  }

  let best: GridLayout = { columns: 1, rows: count, tileWidth: 0, tileHeight: 0 }

  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)

    const availableWidth = size.width - gap * (columns - 1)
    const availableHeight = size.height - gap * (rows - 1)
    if (availableWidth <= 0 || availableHeight <= 0) continue

    // Fit to whichever dimension binds first, preserving aspect ratio.
    const widthLimited = availableWidth / columns
    const heightLimited = (availableHeight / rows) * aspect
    const tileWidth = Math.floor(Math.min(widthLimited, heightLimited))
    const tileHeight = Math.floor(tileWidth / aspect)

    if (tileWidth > best.tileWidth) {
      best = { columns, rows, tileWidth, tileHeight }
    }
  }

  return best
}

export function useGridLayout(count: number, aspect = 16 / 9, gap = 12) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(
    () => computeGridLayout(count, size, aspect, gap),
    [count, size, aspect, gap],
  )

  return { ref, layout, size }
}

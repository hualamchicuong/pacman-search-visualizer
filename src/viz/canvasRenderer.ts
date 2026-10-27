import type { Maze } from '../core/maze'
import { remainingFoods } from '../core/maze'
import type { SearchNode, SearchResult, StepEvent } from '../core/types'

const COLORS = {
  wall: '#1e3a5f',
  corridor: '#0d1b2a',
  grid: '#1a2d42',
  closed: 'rgba(45, 106, 79, 0.72)',
  open: 'rgba(29, 78, 137, 0.75)',
  path: 'rgba(232, 93, 4, 0.85)',
  food: '#f4d35e',
  foodGlow: 'rgba(244, 211, 94, 0.35)',
  pac: '#ffd60a',
  pacStroke: '#1a1408',
}

export interface FrameState {
  stepIndex: number
  event: StepEvent | null
  showPath: boolean
  pathIndex: number
}

/**
 * HiDPI maze canvas — smooth Pac-man / food (not pixel-art).
 * Never falls back to backing-store pixels as CSS size (avoids DPR blow-up when hidden).
 */
export class CanvasRenderer {
  private lastCssW = 480
  private lastCssH = 400

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  static attach(canvas: HTMLCanvasElement): CanvasRenderer {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not available')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    return new CanvasRenderer(canvas, ctx)
  }

  /**
   * @returns false when canvas has no CSS layout size (hidden) — caller should skip draw.
   */
  private syncSize(): boolean {
    const cssW = this.canvas.clientWidth
    const cssH = this.canvas.clientHeight
    if (cssW <= 0 || cssH <= 0) return false

    this.lastCssW = cssW
    this.lastCssH = cssH

    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
    return true
  }

  private cssSize(): { w: number; h: number } {
    const cssW = this.canvas.clientWidth
    const cssH = this.canvas.clientHeight
    return {
      w: cssW > 0 ? cssW : this.lastCssW,
      h: cssH > 0 ? cssH : this.lastCssH,
    }
  }

  draw(maze: Maze, result: SearchResult | null, frame: FrameState): void {
    if (!this.syncSize()) return
    const { w, h } = this.cssSize()
    const pad = 10
    const cell = Math.max(
      8,
      Math.floor(Math.min((w - pad * 2) / maze.width, (h - pad * 2) / maze.height)),
    )
    const ox = Math.floor((w - cell * maze.width) / 2)
    const oy = Math.floor((h - cell * maze.height) / 2)

    this.ctx.clearRect(0, 0, w, h)
    this.ctx.fillStyle = '#071018'
    this.ctx.fillRect(0, 0, w, h)

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const px = ox + x * cell
        const py = oy + y * cell
        this.ctx.fillStyle = maze.walls[y][x] ? COLORS.wall : COLORS.corridor
        this.roundRect(px + 0.5, py + 0.5, cell - 1, cell - 1, Math.min(4, cell * 0.12))
        this.ctx.fill()
        if (!maze.walls[y][x]) {
          this.ctx.strokeStyle = COLORS.grid
          this.ctx.lineWidth = 1
          this.ctx.stroke()
        }
      }
    }

    const event = frame.event
    if (event) {
      for (const c of event.closedCells) {
        this.fillCell(ox, oy, cell, c.x, c.y, COLORS.closed)
      }
      for (const c of event.openCells) {
        this.fillCell(ox, oy, cell, c.x, c.y, COLORS.open)
      }
    }

    if (frame.showPath && result?.found) {
      for (let i = 0; i <= frame.pathIndex && i < result.path.length; i++) {
        const n = result.path[i]
        this.fillCell(ox, oy, cell, n.state.x, n.state.y, COLORS.path)
      }
    }

    const node = this.currentNode(result, frame)
    const mask = node?.state.foodMask ?? (1 << maze.foods.length) - 1
    for (const f of remainingFoods(maze, mask)) {
      this.drawFood(ox, oy, cell, f.x, f.y)
    }

    if (node) this.drawPac(ox, oy, cell, node.state.x, node.state.y)
    else this.drawPac(ox, oy, cell, maze.start.x, maze.start.y)
  }

  private currentNode(result: SearchResult | null, frame: FrameState): SearchNode | null {
    if (frame.showPath && result?.found) {
      return result.path[Math.min(frame.pathIndex, result.path.length - 1)] ?? null
    }
    return frame.event?.node ?? null
  }

  private fillCell(
    ox: number,
    oy: number,
    cell: number,
    x: number,
    y: number,
    color: string,
  ): void {
    this.ctx.fillStyle = color
    this.roundRect(ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4, Math.min(5, cell * 0.14))
    this.ctx.fill()
  }

  private drawFood(ox: number, oy: number, cell: number, x: number, y: number): void {
    const cx = ox + x * cell + cell / 2
    const cy = oy + y * cell + cell / 2
    const r = Math.max(3.5, cell * 0.16)

    this.ctx.beginPath()
    this.ctx.fillStyle = COLORS.foodGlow
    this.ctx.arc(cx, cy, r * 1.85, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.beginPath()
    this.ctx.fillStyle = COLORS.food
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2)
    this.ctx.fill()
  }

  private drawPac(ox: number, oy: number, cell: number, x: number, y: number): void {
    const cx = ox + x * cell + cell / 2
    const cy = oy + y * cell + cell / 2
    const r = Math.max(5, cell * 0.34)
    const mouth = 0.55

    this.ctx.beginPath()
    this.ctx.fillStyle = 'rgba(255, 214, 10, 0.22)'
    this.ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.beginPath()
    this.ctx.fillStyle = COLORS.pac
    this.ctx.moveTo(cx, cy)
    this.ctx.arc(cx, cy, r, mouth, Math.PI * 2 - mouth)
    this.ctx.closePath()
    this.ctx.fill()

    this.ctx.beginPath()
    this.ctx.strokeStyle = 'rgba(26, 20, 8, 0.35)'
    this.ctx.lineWidth = Math.max(1, cell * 0.04)
    this.ctx.arc(cx, cy, r, mouth, Math.PI * 2 - mouth)
    this.ctx.stroke()

    this.ctx.beginPath()
    this.ctx.fillStyle = COLORS.pacStroke
    this.ctx.arc(cx + r * 0.08, cy - r * 0.38, Math.max(1.4, r * 0.13), 0, Math.PI * 2)
    this.ctx.fill()
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2)
    this.ctx.beginPath()
    this.ctx.moveTo(x + rr, y)
    this.ctx.arcTo(x + w, y, x + w, y + h, rr)
    this.ctx.arcTo(x + w, y + h, x, y + h, rr)
    this.ctx.arcTo(x, y + h, x, y, rr)
    this.ctx.arcTo(x, y, x + w, y, rr)
    this.ctx.closePath()
  }
}

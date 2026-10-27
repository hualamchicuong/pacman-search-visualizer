import { parseMaze, type Maze } from '../core/maze'

export type MapSizeId = 'tiny' | 'small' | 'medium'

/** Same footprints as built-in maps */
export const MAP_SIZES: Record<MapSizeId, { width: number; height: number; label: string }> = {
  tiny: { width: 7, height: 5, label: 'tiny (7×5)' },
  small: { width: 11, height: 7, label: 'small (11×7)' },
  medium: { width: 15, height: 9, label: 'medium (15×9)' },
}

export interface GenerateOptions {
  size: MapSizeId
  /** Number of food pellets (ignored when foodsAtCorners) */
  foodCount: number
  /** Open neighbors from Pac-man start (2–4) */
  startExits: 2 | 3 | 4
  /**
   * Place exactly 4 foods at the four interior corner cells.
   * Forces foodCount = 4 (classic “order-of-eating” edge case).
   */
  foodsAtCorners?: boolean
  seed?: number
}

export interface GenerateResult {
  maze: Maze
  openCells: number
  startExits: number
  foodsAtCorners: boolean
  seed: number
}

function fisherYates<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/** Interior cells next to the four map corners (inside the border wall). */
export function cornerFoodSlots(width: number, height: number): Array<{ x: number; y: number }> {
  return [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
  ]
}

/** True when there are exactly 4 foods on the four corner slots. */
export function hasFoodsAtFourCorners(maze: Maze): boolean {
  if (maze.foods.length !== 4) return false
  const want = new Set(cornerFoodSlots(maze.width, maze.height).map((c) => `${c.x},${c.y}`))
  const have = new Set(maze.foods.map((f) => `${f.x},${f.y}`))
  if (want.size !== 4) return false
  for (const k of want) if (!have.has(k)) return false
  return true
}

export class GenerateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerateError'
  }
}

/** Max open cells for a size (border walls only — upper bound for food). */
export function maxOpenCells(size: MapSizeId): number {
  const { width, height } = MAP_SIZES[size]
  return Math.max(0, (width - 2) * (height - 2))
}

/** Practical food cap: bitmask limit + leave room for Pac-man cell. */
export function maxFoodForSize(size: MapSizeId): number {
  return Math.min(20, Math.max(1, maxOpenCells(size) - 1))
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function inBounds(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h
}

function cloneGrid(g: boolean[][]): boolean[][] {
  return g.map((row) => row.slice())
}

function degree(walls: boolean[][], x: number, y: number): number {
  const h = walls.length
  const w = walls[0]!.length
  let d = 0
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (inBounds(w, h, nx, ny) && !walls[ny]![nx]) d++
  }
  return d
}

function openList(walls: boolean[][]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let y = 0; y < walls.length; y++) {
    for (let x = 0; x < walls[y]!.length; x++) {
      if (!walls[y]![x]) out.push({ x, y })
    }
  }
  return out
}

function reachable(walls: boolean[][], sx: number, sy: number): Set<string> {
  const h = walls.length
  const w = walls[0]!.length
  const seen = new Set<string>()
  const q: Array<[number, number]> = [[sx, sy]]
  seen.add(`${sx},${sy}`)
  while (q.length) {
    const [x, y] = q.shift()!
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      const k = `${nx},${ny}`
      if (!inBounds(w, h, nx, ny) || walls[ny]![nx] || seen.has(k)) continue
      seen.add(k)
      q.push([nx, ny])
    }
  }
  return seen
}

function toLayout(
  walls: boolean[][],
  start: { x: number; y: number },
  foods: Array<{ x: number; y: number }>,
): string[] {
  const foodSet = new Set(foods.map((f) => `${f.x},${f.y}`))
  const rows: string[] = []
  for (let y = 0; y < walls.length; y++) {
    let row = ''
    for (let x = 0; x < walls[y]!.length; x++) {
      if (walls[y]![x]) row += '#'
      else if (start.x === x && start.y === y) row += foodSet.has(`${x},${y}`) ? 'F' : 'P'
      else if (foodSet.has(`${x},${y}`)) row += 'o'
      else row += '.'
    }
    rows.push(row)
  }
  return rows
}

/**
 * Pac-man style: border walls + sparse internal blocks (not a perfect maze).
 * Retries until start has the requested exit count and foods are reachable.
 */
export function generateMaze(options: GenerateOptions): GenerateResult {
  const { size, startExits } = options
  const foodsAtCorners = Boolean(options.foodsAtCorners)
  const foodCount = foodsAtCorners ? 4 : options.foodCount

  if (startExits < 2 || startExits > 4) {
    throw new GenerateError('Start exits must be 2, 3, or 4.')
  }
  if (!Number.isInteger(foodCount) || foodCount < 1) {
    throw new GenerateError('Food count must be an integer ≥ 1.')
  }

  const maxFood = maxFoodForSize(size)
  if (foodCount > maxFood) {
    throw new GenerateError(
      `Food count ${foodCount} exceeds max ${maxFood} for size "${size}" (open cells − 1, cap 20).`,
    )
  }
  if (foodsAtCorners && maxFood < 4) {
    throw new GenerateError(`Size "${size}" is too small for 4 corner foods.`)
  }

  const { width: w, height: h } = MAP_SIZES[size]
  const corners = cornerFoodSlots(w, h)
  const cornerKey = new Set(corners.map((c) => `${c.x},${c.y}`))
  const seed = options.seed ?? (Date.now() ^ (Math.random() * 1e9)) | 0
  const rand = mulberry32(seed)

  const maxAttempts = 100
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let walls = buildSparseWalls(w, h, rand)

    // Corner-food maps: force the four corner cells open
    if (foodsAtCorners) {
      for (const c of corners) walls[c.y]![c.x] = false
    }

    const opens = openList(walls)
    if (opens.length < foodCount + 1) continue

    // Prefer cells that already have enough exits; carve if needed
    // When corner foods: Pac-man must not start on a corner food cell
    const candidates = opens
      .map((c) => ({ ...c, d: degree(walls, c.x, c.y) }))
      .filter((c) => c.d >= startExits)
      .filter((c) => !(foodsAtCorners && cornerKey.has(`${c.x},${c.y}`)))
      .sort((a, b) => Math.abs(a.d - startExits) - Math.abs(b.d - startExits))

    let start: { x: number; y: number } | null = null
    let working = walls

    for (const c of candidates) {
      const trial = cloneGrid(walls)
      if (foodsAtCorners) {
        for (const corner of corners) trial[corner.y]![corner.x] = false
      }
      if (forceExits(trial, c.x, c.y, startExits, rand)) {
        if (foodsAtCorners) {
          for (const corner of corners) trial[corner.y]![corner.x] = false
        }
        if (degree(trial, c.x, c.y) === startExits) {
          start = { x: c.x, y: c.y }
          working = trial
          break
        }
      }
    }

    // Fallback: try every open cell and carve
    if (!start) {
      const shuffled = [...opens].filter(
        (c) => !(foodsAtCorners && cornerKey.has(`${c.x},${c.y}`)),
      )
      fisherYates(shuffled, rand)
      for (const c of shuffled) {
        const trial = cloneGrid(walls)
        if (foodsAtCorners) {
          for (const corner of corners) trial[corner.y]![corner.x] = false
        }
        if (forceExits(trial, c.x, c.y, startExits, rand) && degree(trial, c.x, c.y) === startExits) {
          if (foodsAtCorners) {
            for (const corner of corners) trial[corner.y]![corner.x] = false
          }
          start = { x: c.x, y: c.y }
          working = trial
          break
        }
      }
    }

    if (!start) continue

    // Keep corners open after start carving
    if (foodsAtCorners) {
      for (const c of corners) working[c.y]![c.x] = false
    }

    const reach = reachable(working, start.x, start.y)
    const openCount = openList(working).length
    // Require a single connected open component from Pac-man
    if (reach.size !== openCount) continue

    if (foodsAtCorners) {
      const allCornersReachable = corners.every((c) => reach.has(`${c.x},${c.y}`))
      if (!allCornersReachable) continue
      if (cornerKey.has(`${start.x},${start.y}`)) continue
    }

    let foods: Array<{ x: number; y: number }>
    if (foodsAtCorners) {
      foods = corners.map((c) => ({ ...c }))
    } else {
      const places = [...reach]
        .map((k) => {
          const [x, y] = k.split(',').map(Number)
          return { x, y }
        })
        .filter((c) => !(c.x === start!.x && c.y === start!.y))

      if (places.length < foodCount) continue
      fisherYates(places, rand)
      foods = places.slice(0, foodCount)
    }

    const layout = toLayout(working, start, foods)
    const maze = parseMaze(`custom-${size}`, layout)
    return {
      maze,
      openCells: openCount,
      startExits: degree(working, start.x, start.y),
      foodsAtCorners: foodsAtCorners && hasFoodsAtFourCorners(maze),
      seed,
    }
  }

  throw new GenerateError(
    foodsAtCorners
      ? `Could not generate a 4-corner-food map after ${maxAttempts} tries. Try another size or start exits.`
      : `Could not generate a valid map after ${maxAttempts} tries. Try fewer foods or different start exits.`,
  )
}

/** Border walls + random internal wall cells, keeping the interior mostly connected. */
function buildSparseWalls(w: number, h: number, rand: () => number): boolean[][] {
  const walls: boolean[][] = []
  for (let y = 0; y < h; y++) {
    walls[y] = []
    for (let x = 0; x < w; x++) {
      walls[y]![x] = x === 0 || y === 0 || x === w - 1 || y === h - 1
    }
  }

  // Density scales with size — leave enough open for foods / junctions
  const interior = (w - 2) * (h - 2)
  const targetWalls = Math.floor(interior * (0.22 + rand() * 0.12))
  let placed = 0
  let guard = 0
  while (placed < targetWalls && guard < interior * 8) {
    guard++
    const x = 1 + Math.floor(rand() * (w - 2))
    const y = 1 + Math.floor(rand() * (h - 2))
    if (walls[y]![x]) continue
    walls[y]![x] = true
    // Keep one large connected open component from a seed cell
    const seedX = 1
    const seedY = 1
    if (walls[seedY]![seedX] || reachable(walls, seedX, seedY).size < interior - placed - 2) {
      walls[y]![x] = false
      continue
    }
    placed++
  }

  return walls
}

/**
 * Ensure exactly `want` open cardinal neighbors by opening walls or closing extras.
 * Never opens the outer border.
 */
function forceExits(
  walls: boolean[][],
  x: number,
  y: number,
  want: number,
  rand: () => number,
): boolean {
  const h = walls.length
  const w = walls[0]!.length
  if (walls[y]![x]) walls[y]![x] = false

  const neighbors = DIRS.map(([dx, dy]) => ({
    x: x + dx,
    y: y + dy,
    dx,
    dy,
  })).filter((n) => inBounds(w, h, n.x, n.y) && n.x > 0 && n.y > 0 && n.x < w - 1 && n.y < h - 1)

  if (neighbors.length < want) return false

  // Shuffle
  for (let i = neighbors.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[neighbors[i], neighbors[j]] = [neighbors[j]!, neighbors[i]!]
  }

  const openOnes = neighbors.slice(0, want)
  const closeOnes = neighbors.slice(want)

  for (const n of openOnes) walls[n.y]![n.x] = false
  for (const n of closeOnes) {
    // Only close if it doesn't sit on border (already filtered)
    walls[n.y]![n.x] = true
  }

  // Re-open if we accidentally isolated start
  if (!reachable(walls, x, y).has(`${openOnes[0]!.x},${openOnes[0]!.y}`)) {
    for (const n of openOnes) walls[n.y]![n.x] = false
  }

  return degree(walls, x, y) === want
}

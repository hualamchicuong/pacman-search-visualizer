export interface FoodCell {
  x: number
  y: number
  bit: number
}

export interface Maze {
  name: string
  width: number
  height: number
  /** walls[y][x] — true = wall */
  walls: boolean[][]
  start: { x: number; y: number }
  foods: FoodCell[]
  layout: string[]
}

/**
 * ASCII layout:
 * # wall, . corridor, P start, o food, F food+start (rare)
 */
export function parseMaze(name: string, layout: string[]): Maze {
  const rows = layout.map((r) => r.trimEnd()).filter((r) => r.length > 0)
  const height = rows.length
  const width = Math.max(...rows.map((r) => r.length))
  const walls: boolean[][] = []
  const foods: FoodCell[] = []
  let start: { x: number; y: number } | null = null
  let foodBit = 0

  for (let y = 0; y < height; y++) {
    const row = rows[y].padEnd(width, '#')
    walls[y] = []
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (ch === '#') {
        walls[y][x] = true
      } else {
        walls[y][x] = false
        if (ch === 'P' || ch === 'F') {
          start = { x, y }
        }
        if (ch === 'o' || ch === 'F') {
          foods.push({ x, y, bit: foodBit })
          foodBit++
        }
      }
    }
  }

  if (!start) {
    throw new Error(`Map "${name}" has no Pac-man start (P)`)
  }
  if (foods.length === 0) {
    throw new Error(`Map "${name}" has no food (o)`)
  }
  if (foods.length > 20) {
    throw new Error(`Map "${name}" has too many foods for bitmask (${foods.length})`)
  }

  return { name, width, height, walls, start, foods, layout: rows }
}

export function fullFoodMask(maze: Maze): number {
  return (1 << maze.foods.length) - 1
}

export function foodIndexAt(maze: Maze, x: number, y: number): number {
  return maze.foods.findIndex((f) => f.x === x && f.y === y)
}

export function remainingFoods(maze: Maze, mask: number): FoodCell[] {
  return maze.foods.filter((f) => (mask & (1 << f.bit)) !== 0)
}

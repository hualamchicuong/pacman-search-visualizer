import { remainingFoods, type Maze } from '../core/maze'
import type { State } from '../core/types'

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

/**
 * Admissible heuristic for multi-food Pac-man:
 * h = dist(pac, nearest remaining food) + MST cost over remaining foods
 * (when no food left, h = 0).
 */
export function heuristic(maze: Maze, state: State): number {
  const foods = remainingFoods(maze, state.foodMask)
  if (foods.length === 0) return 0

  let nearest = Infinity
  for (const f of foods) {
    nearest = Math.min(nearest, manhattan(state.x, state.y, f.x, f.y))
  }

  if (foods.length === 1) return nearest

  // Prim MST on complete graph of remaining food positions (Manhattan edges)
  const n = foods.length
  const inTree = new Array<boolean>(n).fill(false)
  const minEdge = new Array<number>(n).fill(Infinity)
  minEdge[0] = 0
  let mst = 0

  for (let iter = 0; iter < n; iter++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!inTree[i] && minEdge[i] < best) {
        best = minEdge[i]
        u = i
      }
    }
    inTree[u] = true
    mst += best === Infinity ? 0 : best
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue
      const w = manhattan(foods[u].x, foods[u].y, foods[v].x, foods[v].y)
      if (w < minEdge[v]) minEdge[v] = w
    }
  }

  return nearest + mst
}

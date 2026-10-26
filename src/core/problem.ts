import type { Action, State } from './types'
import { foodIndexAt, fullFoodMask, type Maze } from './maze'

const DELTAS: Record<Action, { dx: number; dy: number }> = {
  Up: { dx: 0, dy: -1 },
  Down: { dx: 0, dy: 1 },
  Left: { dx: -1, dy: 0 },
  Right: { dx: 1, dy: 0 },
}

export const ACTIONS: Action[] = ['Up', 'Down', 'Left', 'Right']

export function initialState(maze: Maze): State {
  return {
    x: maze.start.x,
    y: maze.start.y,
    foodMask: fullFoodMask(maze),
  }
}

export function isGoal(state: State): boolean {
  return state.foodMask === 0
}

export function stepCost(): number {
  return 1
}

export function applyAction(maze: Maze, state: State, action: Action): State | null {
  const { dx, dy } = DELTAS[action]
  const nx = state.x + dx
  const ny = state.y + dy
  if (nx < 0 || ny < 0 || nx >= maze.width || ny >= maze.height) return null
  if (maze.walls[ny][nx]) return null

  let foodMask = state.foodMask
  const idx = foodIndexAt(maze, nx, ny)
  if (idx >= 0) {
    foodMask &= ~(1 << maze.foods[idx].bit)
  }
  return { x: nx, y: ny, foodMask }
}

export function successors(
  maze: Maze,
  state: State,
): Array<{ action: Action; state: State; cost: number }> {
  const out: Array<{ action: Action; state: State; cost: number }> = []
  for (const action of ACTIONS) {
    const next = applyAction(maze, state, action)
    if (next) out.push({ action, state: next, cost: stepCost() })
  }
  return out
}

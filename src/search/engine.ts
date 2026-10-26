import type { Maze } from '../core/maze'
import { initialState, isGoal, successors } from '../core/problem'
import {
  ALGORITHM_META,
  stateKey,
  type Action,
  type AlgorithmId,
  type SearchMetrics,
  type SearchNode,
  type SearchResult,
  type StepEvent,
} from '../core/types'
import { heuristic } from './heuristic'

type FrontierKind = 'fifo' | 'lifo' | 'ucs' | 'greedy' | 'astar'

interface EngineOptions {
  algorithm: AlgorithmId
  frontier: FrontierKind
  useHeuristic: boolean
  maxExpanded?: number
  maxRecordedSteps?: number
}

class Frontier {
  private items: SearchNode[] = []
  constructor(private kind: FrontierKind) {}

  get size(): number {
    return this.items.length
  }

  push(node: SearchNode): void {
    this.items.push(node)
  }

  pop(): SearchNode | undefined {
    if (this.items.length === 0) return undefined
    if (this.kind === 'fifo') return this.items.shift()
    if (this.kind === 'lifo') return this.items.pop()

    let bestIdx = 0
    let bestScore = this.score(this.items[0])
    for (let i = 1; i < this.items.length; i++) {
      const s = this.score(this.items[i])
      if (s < bestScore) {
        bestScore = s
        bestIdx = i
      }
    }
    return this.items.splice(bestIdx, 1)[0]
  }

  snapshotCells(): Array<{ x: number; y: number }> {
    const seen = new Set<string>()
    const cells: Array<{ x: number; y: number }> = []
    for (const n of this.items) {
      const k = `${n.state.x},${n.state.y}`
      if (!seen.has(k)) {
        seen.add(k)
        cells.push({ x: n.state.x, y: n.state.y })
      }
    }
    return cells
  }

  private score(n: SearchNode): number {
    if (this.kind === 'ucs') return n.g
    if (this.kind === 'greedy') return n.h
    return n.f
  }
}

function reconstruct(goal: SearchNode): { path: SearchNode[]; actions: Action[] } {
  const path: SearchNode[] = []
  const actions: Action[] = []
  let cur: SearchNode | null = goal
  while (cur) {
    path.push(cur)
    if (cur.action) actions.push(cur.action)
    cur = cur.parent
  }
  path.reverse()
  actions.reverse()
  return { path, actions }
}

/** Collect unique board cells from full state keys "x,y,mask" */
function closedCellsFrom(keys: Iterable<string>): Array<{ x: number; y: number }> {
  const seen = new Set<string>()
  const cells: Array<{ x: number; y: number }> = []
  for (const key of keys) {
    const parts = key.split(',')
    const cellKey = `${parts[0]},${parts[1]}`
    if (!seen.has(cellKey)) {
      seen.add(cellKey)
      cells.push({ x: Number(parts[0]), y: Number(parts[1]) })
    }
  }
  return cells
}

export function runSearch(maze: Maze, options: EngineOptions): SearchResult {
  const t0 = performance.now()
  const maxExpanded = options.maxExpanded ?? 150_000
  const maxRecordedSteps = options.maxRecordedSteps ?? 6_000
  const startState = initialState(maze)
  const h0 = options.useHeuristic ? heuristic(maze, startState) : 0
  const root: SearchNode = {
    state: startState,
    g: 0,
    h: h0,
    f: h0,
    parent: null,
    action: null,
  }

  const open = new Frontier(options.frontier)
  open.push(root)

  const bestG = new Map<string, number>()
  bestG.set(stateKey(startState), 0)

  const closedKeys = new Set<string>()
  const steps: StepEvent[] = []
  let nodesExpanded = 0
  let nodesGenerated = 1
  let goalNode: SearchNode | null = null
  let recordStride = 1

  const record = (event: StepEvent): void => {
    if (event.kind === 'goal' || steps.length < maxRecordedSteps) {
      if (event.kind === 'goal' || nodesExpanded % recordStride === 0) {
        steps.push(event)
      }
      return
    }
    // Thin out recording if trace grows too large
    recordStride = Math.max(recordStride * 2, 2)
  }

  while (open.size > 0) {
    const node = open.pop()!
    const key = stateKey(node.state)

    const known = bestG.get(key)
    if (known !== undefined && node.g > known) continue
    if (closedKeys.has(key)) continue

    closedKeys.add(key)
    nodesExpanded++

    if (isGoal(node.state)) {
      record({
        kind: 'goal',
        node,
        openCells: open.snapshotCells(),
        closedCells: closedCellsFrom(closedKeys),
      })
      goalNode = node
      break
    }

    for (const { action, state, cost } of successors(maze, node.state)) {
      const childG = node.g + cost
      const childKey = stateKey(state)
      const prev = bestG.get(childKey)
      if (prev !== undefined && childG >= prev) continue
      if (closedKeys.has(childKey)) {
        if (options.frontier === 'fifo' || options.frontier === 'lifo') continue
        // Priority searches: allow better path reopen by clearing closed
        closedKeys.delete(childKey)
      }

      bestG.set(childKey, childG)
      const h = options.useHeuristic ? heuristic(maze, state) : 0
      const child: SearchNode = {
        state,
        g: childG,
        h,
        f: childG + h,
        parent: node,
        action,
      }
      open.push(child)
      nodesGenerated++
    }

    record({
      kind: 'expand',
      node,
      openCells: open.snapshotCells(),
      closedCells: closedCellsFrom(closedKeys),
    })

    if (nodesExpanded >= maxExpanded) break
  }

  const timeMs = performance.now() - t0
  const meta = ALGORITHM_META[options.algorithm]
  const { path, actions } = goalNode
    ? reconstruct(goalNode)
    : { path: [] as SearchNode[], actions: [] as Action[] }

  const metrics: SearchMetrics = {
    algorithm: options.algorithm,
    nodesExpanded,
    nodesGenerated,
    pathCost: goalNode ? goalNode.g : null,
    depth: goalNode ? goalNode.g : null,
    timeMs: Math.round(timeMs * 100) / 100,
    found: goalNode !== null,
    complete: meta.complete,
    optimal: meta.optimal,
  }

  return {
    algorithm: options.algorithm,
    found: goalNode !== null,
    path,
    actions,
    steps,
    metrics,
  }
}

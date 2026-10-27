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
  type TerminationReason,
} from '../core/types'
import { heuristic } from './heuristic'

type FrontierKind = 'fifo' | 'lifo' | 'ucs' | 'greedy' | 'astar'

export interface EngineOptions {
  algorithm: AlgorithmId
  frontier: FrontierKind
  useHeuristic: boolean
  maxExpanded?: number
  maxRecordedSteps?: number
  /** Polled during search (sync or async); return true to abort */
  shouldCancel?: () => boolean
}

/** Binary min-heap keyed by score(node); stable by insertion order on ties. */
class MinHeap {
  private items: SearchNode[] = []
  private seq = 0
  private order = new WeakMap<SearchNode, number>()

  constructor(private scoreOf: (n: SearchNode) => number) {}

  get size(): number {
    return this.items.length
  }

  push(node: SearchNode): void {
    this.order.set(node, this.seq++)
    this.items.push(node)
    this.bubbleUp(this.items.length - 1)
  }

  pop(): SearchNode | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]!
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      this.bubbleDown(0)
    }
    return top
  }

  private better(a: SearchNode, b: SearchNode): boolean {
    const sa = this.scoreOf(a)
    const sb = this.scoreOf(b)
    if (sa !== sb) return sa < sb
    return (this.order.get(a) ?? 0) < (this.order.get(b) ?? 0)
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.better(this.items[i]!, this.items[p]!)) break
      ;[this.items[i], this.items[p]] = [this.items[p]!, this.items[i]!]
      i = p
    }
  }

  private bubbleDown(i: number): void {
    const n = this.items.length
    for (;;) {
      let best = i
      const l = i * 2 + 1
      const r = l + 1
      if (l < n && this.better(this.items[l]!, this.items[best]!)) best = l
      if (r < n && this.better(this.items[r]!, this.items[best]!)) best = r
      if (best === i) break
      ;[this.items[i], this.items[best]] = [this.items[best]!, this.items[i]!]
      i = best
    }
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
}

class Frontier {
  private fifo: SearchNode[] = []
  private fifoHead = 0
  private lifo: SearchNode[] = []
  private heap: MinHeap | null = null

  constructor(private kind: FrontierKind) {
    if (kind === 'ucs' || kind === 'greedy' || kind === 'astar') {
      this.heap = new MinHeap((n) => this.score(n))
    }
  }

  get size(): number {
    if (this.heap) return this.heap.size
    if (this.kind === 'lifo') return this.lifo.length
    return this.fifo.length - this.fifoHead
  }

  push(node: SearchNode): void {
    if (this.heap) {
      this.heap.push(node)
      return
    }
    if (this.kind === 'lifo') this.lifo.push(node)
    else this.fifo.push(node)
  }

  pop(): SearchNode | undefined {
    if (this.heap) return this.heap.pop()
    if (this.kind === 'lifo') return this.lifo.pop()
    if (this.fifoHead >= this.fifo.length) return undefined
    const n = this.fifo[this.fifoHead++]
    // Occasional compact to free head slack
    if (this.fifoHead > 256 && this.fifoHead * 2 > this.fifo.length) {
      this.fifo = this.fifo.slice(this.fifoHead)
      this.fifoHead = 0
    }
    return n
  }

  snapshotCells(): Array<{ x: number; y: number }> {
    if (this.heap) return this.heap.snapshotCells()
    const seen = new Set<string>()
    const cells: Array<{ x: number; y: number }> = []
    const src = this.kind === 'lifo' ? this.lifo : this.fifo.slice(this.fifoHead)
    for (const n of src) {
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

/**
 * Reservoir-style trace: keep up to maxRecordedSteps expand events spread across the run.
 * Goal is always appended. Non-goal runs always pin the terminal expand.
 * `sourceStep` comes from caller (nodesExpanded); `seenExpands` is only for sampling odds.
 */
class TraceRecorder {
  private expands: StepEvent[] = []
  private seenExpands = 0
  private sampled = false

  constructor(private maxSteps: number) {}

  /**
   * Advance expand counter; return true if this expand should be stored
   * (caller builds OPEN/CLOSED snapshots only when true).
   */
  acceptExpand(): boolean {
    this.seenExpands++
    if (this.expands.length < this.maxSteps) return true
    this.sampled = true
    return Math.random() < this.maxSteps / this.seenExpands
  }

  storeExpand(
    node: SearchNode,
    openCells: Array<{ x: number; y: number }>,
    closedCells: Array<{ x: number; y: number }>,
    sourceStep: number,
  ): void {
    const event: StepEvent = {
      kind: 'expand',
      node,
      openCells,
      closedCells,
      sourceStep,
    }
    if (this.expands.length < this.maxSteps) {
      this.expands.push(event)
      return
    }
    const j = Math.floor(Math.random() * this.maxSteps)
    this.expands[j] = event
  }

  /** Ensure terminal expand is present (replace last slot if at capacity). */
  private pinTerminal(event: StepEvent): void {
    const src = event.sourceStep ?? 0
    if (this.expands.some((e) => (e.sourceStep ?? 0) === src)) return
    this.sampled = true
    if (this.expands.length < this.maxSteps) {
      this.expands.push(event)
      return
    }
    if (this.expands.length === 0) {
      this.expands.push(event)
      return
    }
    this.expands[this.expands.length - 1] = event
  }

  finishWithGoal(
    node: SearchNode,
    openCells: Array<{ x: number; y: number }>,
    closedCells: Array<{ x: number; y: number }>,
    sourceStep: number,
  ): StepEvent[] {
    const goal: StepEvent = {
      kind: 'goal',
      node,
      openCells,
      closedCells,
      sourceStep,
    }
    this.expands.sort((a, b) => (a.sourceStep ?? 0) - (b.sourceStep ?? 0))
    return [...this.expands, goal]
  }

  finishWithoutGoal(terminal: StepEvent | null): StepEvent[] {
    if (terminal) this.pinTerminal(terminal)
    this.expands.sort((a, b) => (a.sourceStep ?? 0) - (b.sourceStep ?? 0))
    if (this.seenExpands > this.expands.length) this.sampled = true
    return [...this.expands]
  }

  get stats(): { sampled: boolean; recorded: number; seen: number } {
    return {
      sampled: this.sampled || this.seenExpands > this.expands.length,
      recorded: this.expands.length,
      seen: this.seenExpands,
    }
  }
}

function yieldMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

type SearchCtx = {
  options: EngineOptions
  maze: Maze
  t0: number
  maxExpanded: number
  open: Frontier
  bestG: Map<string, number>
  closedKeys: Set<string>
  trace: TraceRecorder
  nodesExpanded: number
  nodesGenerated: number
  /** Last non-goal expanded node (for terminal trace pin) */
  lastExpandedNode: SearchNode | null
}

function beginSearch(maze: Maze, options: EngineOptions): SearchCtx {
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
  return {
    options,
    maze,
    t0: performance.now(),
    maxExpanded: options.maxExpanded ?? 150_000,
    open,
    bestG,
    closedKeys: new Set<string>(),
    trace: new TraceRecorder(options.maxRecordedSteps ?? 6_000),
    nodesExpanded: 0,
    nodesGenerated: 1,
    lastExpandedNode: null,
  }
}

/** One expansion step. Returns a finished result, or null to continue. */
function stepSearch(ctx: SearchCtx): SearchResult | 'cancelled' | 'limit' | null {
  if (ctx.options.shouldCancel?.()) return 'cancelled'
  if (ctx.open.size === 0) return null

  const node = ctx.open.pop()!
  const key = stateKey(node.state)
  const known = ctx.bestG.get(key)
  if (known !== undefined && node.g > known) return null
  if (ctx.closedKeys.has(key)) return null

  ctx.closedKeys.add(key)
  ctx.nodesExpanded++

  if (isGoal(node.state)) {
    const steps = ctx.trace.finishWithGoal(
      node,
      ctx.open.snapshotCells(),
      closedCellsFrom(ctx.closedKeys),
      ctx.nodesExpanded,
    )
    return finish(
      ctx.options,
      ctx.maze,
      ctx.t0,
      ctx.nodesExpanded,
      ctx.nodesGenerated,
      node,
      steps,
      'goal',
      ctx.trace.stats,
    )
  }

  for (const { action, state, cost } of successors(ctx.maze, node.state)) {
    const childG = node.g + cost
    const childKey = stateKey(state)
    const prev = ctx.bestG.get(childKey)
    if (prev !== undefined && childG >= prev) continue
    if (ctx.closedKeys.has(childKey)) {
      if (ctx.options.frontier === 'fifo' || ctx.options.frontier === 'lifo') continue
      ctx.closedKeys.delete(childKey)
    }
    ctx.bestG.set(childKey, childG)
    const h = ctx.options.useHeuristic ? heuristic(ctx.maze, state) : 0
    ctx.open.push({
      state,
      g: childG,
      h,
      f: childG + h,
      parent: node,
      action,
    })
    ctx.nodesGenerated++
  }

  ctx.lastExpandedNode = node

  // Snapshot OPEN/CLOSED only when this expand is kept in the reservoir
  if (ctx.trace.acceptExpand()) {
    ctx.trace.storeExpand(
      node,
      ctx.open.snapshotCells(),
      closedCellsFrom(ctx.closedKeys),
      ctx.nodesExpanded,
    )
  }

  if (ctx.nodesExpanded >= ctx.maxExpanded) return 'limit'
  return null
}

function endSearch(
  ctx: SearchCtx,
  termination: TerminationReason,
  goalNode: SearchNode | null = null,
): SearchResult {
  let steps: StepEvent[]
  if (goalNode && termination === 'goal') {
    steps = ctx.trace.finishWithGoal(
      goalNode,
      ctx.open.snapshotCells(),
      closedCellsFrom(ctx.closedKeys),
      ctx.nodesExpanded,
    )
  } else {
    // One terminal snapshot at stop (limit / exhausted / cancelled) if missing from reservoir
    const terminal: StepEvent | null = ctx.lastExpandedNode
      ? {
          kind: 'expand',
          node: ctx.lastExpandedNode,
          openCells: ctx.open.snapshotCells(),
          closedCells: closedCellsFrom(ctx.closedKeys),
          sourceStep: ctx.nodesExpanded,
        }
      : null
    steps = ctx.trace.finishWithoutGoal(terminal)
  }
  return finish(
    ctx.options,
    ctx.maze,
    ctx.t0,
    ctx.nodesExpanded,
    ctx.nodesGenerated,
    goalNode,
    steps,
    termination,
    ctx.trace.stats,
  )
}

/** Sync search (scripts / Node). */
export function runSearch(maze: Maze, options: EngineOptions): SearchResult {
  const ctx = beginSearch(maze, options)
  for (;;) {
    if (ctx.open.size === 0) return endSearch(ctx, 'exhausted')
    const out = stepSearch(ctx)
    if (out === null) continue
    if (out === 'cancelled') return endSearch(ctx, 'cancelled')
    if (out === 'limit') return endSearch(ctx, 'limit')
    return out
  }
}

/**
 * Async search for Web Worker: yields every `yieldEvery` expands so cancel
 * messages can be processed on the worker event loop.
 */
export async function runSearchAsync(
  maze: Maze,
  options: EngineOptions,
  yieldEvery = 256,
): Promise<SearchResult> {
  const ctx = beginSearch(maze, options)
  for (;;) {
    if (ctx.open.size === 0) return endSearch(ctx, 'exhausted')
    const out = stepSearch(ctx)
    if (out === null) {
      if (ctx.nodesExpanded > 0 && ctx.nodesExpanded % yieldEvery === 0) {
        await yieldMacrotask()
        if (ctx.options.shouldCancel?.()) return endSearch(ctx, 'cancelled')
      }
      continue
    }
    if (out === 'cancelled') return endSearch(ctx, 'cancelled')
    if (out === 'limit') return endSearch(ctx, 'limit')
    return out
  }
}

function finish(
  options: EngineOptions,
  _maze: Maze,
  t0: number,
  nodesExpanded: number,
  nodesGenerated: number,
  goalNode: SearchNode | null,
  steps: StepEvent[],
  termination: TerminationReason,
  traceStats: { sampled: boolean; recorded: number; seen: number },
): SearchResult {
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
    terminationReason: termination,
    traceSampled: traceStats.sampled,
    traceRecorded: traceStats.recorded,
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

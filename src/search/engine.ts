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

function cellKey(x: number, y: number): string {
  return `${x},${y}`
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
}

/**
 * Frontier with O(1) cell-count updates so OPEN snapshots stay O(#cells), not O(|OPEN|).
 * Stale heap duplicates still decrement on pop (multiplicity tracks entries, not unique states).
 */
class Frontier {
  private fifo: SearchNode[] = []
  private fifoHead = 0
  private lifo: SearchNode[] = []
  private heap: MinHeap | null = null
  /** cellKey → number of frontier entries at that board cell */
  private cellCounts = new Map<string, number>()

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
    this.incCell(node.state.x, node.state.y)
    if (this.heap) {
      this.heap.push(node)
      return
    }
    if (this.kind === 'lifo') this.lifo.push(node)
    else this.fifo.push(node)
  }

  pop(): SearchNode | undefined {
    let n: SearchNode | undefined
    if (this.heap) n = this.heap.pop()
    else if (this.kind === 'lifo') n = this.lifo.pop()
    else {
      if (this.fifoHead >= this.fifo.length) return undefined
      n = this.fifo[this.fifoHead++]
      if (this.fifoHead > 256 && this.fifoHead * 2 > this.fifo.length) {
        this.fifo = this.fifo.slice(this.fifoHead)
        this.fifoHead = 0
      }
    }
    if (n) this.decCell(n.state.x, n.state.y)
    return n
  }

  snapshotCells(): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = []
    for (const k of this.cellCounts.keys()) {
      const [xs, ys] = k.split(',')
      cells.push({ x: Number(xs), y: Number(ys) })
    }
    return cells
  }

  private incCell(x: number, y: number): void {
    const k = cellKey(x, y)
    this.cellCounts.set(k, (this.cellCounts.get(k) ?? 0) + 1)
  }

  private decCell(x: number, y: number): void {
    const k = cellKey(x, y)
    const c = (this.cellCounts.get(k) ?? 0) - 1
    if (c <= 0) this.cellCounts.delete(k)
    else this.cellCounts.set(k, c)
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

function closedCellsArray(cells: Set<string>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (const k of cells) {
    const [xs, ys] = k.split(',')
    out.push({ x: Number(xs), y: Number(ys) })
  }
  return out
}

/**
 * Reservoir-style trace: keep up to maxRecordedSteps expand events spread across the run.
 * Goal is always appended. Non-goal runs always pin the terminal expand.
 * Uses seeded RNG so sampled playback is reproducible for a given run length.
 */
class TraceRecorder {
  private expands: StepEvent[] = []
  private seenExpands = 0
  private sampled = false
  private rand: () => number

  constructor(private maxSteps: number, seed = 0x9e3779b9) {
    this.rand = mulberry32(seed)
  }

  /**
   * Advance expand counter; return true if this expand should be stored
   * (caller builds OPEN/CLOSED snapshots only when true).
   */
  acceptExpand(): boolean {
    this.seenExpands++
    if (this.expands.length < this.maxSteps) return true
    this.sampled = true
    return this.rand() < this.maxSteps / this.seenExpands
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
    const j = Math.floor(this.rand() * this.maxSteps)
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
  /** Accumulated wall-clock spent on trace snapshots (excluded from timeMs) */
  traceMs: number
  maxExpanded: number
  open: Frontier
  bestG: Map<string, number>
  closedKeys: Set<string>
  /** Board cells that have been expanded at least once (heatmap projection) */
  closedCells: Set<string>
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
    traceMs: 0,
    maxExpanded: options.maxExpanded ?? 150_000,
    open,
    bestG,
    closedKeys: new Set<string>(),
    closedCells: new Set<string>(),
    trace: new TraceRecorder(options.maxRecordedSteps ?? 6_000),
    nodesExpanded: 0,
    nodesGenerated: 1,
    lastExpandedNode: null,
  }
}

/** Snapshot OPEN/CLOSED; cost charged to traceMs (not search timeMs). */
function snapshotOpenClosed(ctx: SearchCtx): {
  openCells: Array<{ x: number; y: number }>
  closedCells: Array<{ x: number; y: number }>
} {
  const t = performance.now()
  const openCells = ctx.open.snapshotCells()
  const closedCells = closedCellsArray(ctx.closedCells)
  ctx.traceMs += performance.now() - t
  return { openCells, closedCells }
}

/**
 * Only UCS / A* may improve a known state by better g (and reopen from CLOSED).
 * BFS / DFS / Greedy skip any state already in OPEN ∪ CLOSED (textbook graph search).
 */
function allowGImprove(kind: FrontierKind): boolean {
  return kind === 'ucs' || kind === 'astar'
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
  ctx.closedCells.add(cellKey(node.state.x, node.state.y))
  ctx.nodesExpanded++

  if (isGoal(node.state)) {
    const snap = snapshotOpenClosed(ctx)
    const steps = ctx.trace.finishWithGoal(
      node,
      snap.openCells,
      snap.closedCells,
      ctx.nodesExpanded,
    )
    return finish(
      ctx.options,
      ctx.t0,
      ctx.traceMs,
      ctx.nodesExpanded,
      ctx.nodesGenerated,
      node,
      steps,
      'goal',
      ctx.trace.stats,
    )
  }

  const canImprove = allowGImprove(ctx.options.frontier)

  for (const { action, state, cost } of successors(ctx.maze, node.state)) {
    const childG = node.g + cost
    const childKey = stateKey(state)
    const prev = ctx.bestG.get(childKey)

    if (prev !== undefined) {
      // Already in OPEN or CLOSED
      if (!canImprove || childG >= prev) continue
      // UCS / A*: better g — reopen if closed
      if (ctx.closedKeys.has(childKey)) {
        ctx.closedKeys.delete(childKey)
        // Keep closedCells: heatmap = ever-expanded projection
      }
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
    const snap = snapshotOpenClosed(ctx)
    ctx.trace.storeExpand(node, snap.openCells, snap.closedCells, ctx.nodesExpanded)
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
    const snap = snapshotOpenClosed(ctx)
    steps = ctx.trace.finishWithGoal(
      goalNode,
      snap.openCells,
      snap.closedCells,
      ctx.nodesExpanded,
    )
  } else {
    // One terminal snapshot at stop (limit / exhausted / cancelled) if missing from reservoir
    let terminal: StepEvent | null = null
    if (ctx.lastExpandedNode) {
      const snap = snapshotOpenClosed(ctx)
      terminal = {
        kind: 'expand',
        node: ctx.lastExpandedNode,
        openCells: snap.openCells,
        closedCells: snap.closedCells,
        sourceStep: ctx.nodesExpanded,
      }
    }
    steps = ctx.trace.finishWithoutGoal(terminal)
  }
  return finish(
    ctx.options,
    ctx.t0,
    ctx.traceMs,
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
 * Yield wall-clock is excluded from search timeMs (paused between expands).
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
        // Pause the search timer across the yield so timeMs stays pure search
        const pauseStart = performance.now()
        await yieldMacrotask()
        ctx.t0 += performance.now() - pauseStart
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
  t0: number,
  traceMs: number,
  nodesExpanded: number,
  nodesGenerated: number,
  goalNode: SearchNode | null,
  steps: StepEvent[],
  termination: TerminationReason,
  traceStats: { sampled: boolean; recorded: number; seen: number },
): SearchResult {
  const wallMs = performance.now() - t0
  const searchMs = Math.max(0, wallMs - traceMs)
  const meta = ALGORITHM_META[options.algorithm]
  const { path, actions } = goalNode
    ? reconstruct(goalNode)
    : { path: [] as SearchNode[], actions: [] as Action[] }

  const metrics: SearchMetrics = {
    algorithm: options.algorithm,
    nodesExpanded,
    nodesGenerated,
    pathCost: goalNode ? goalNode.g : null,
    timeMs: Math.round(searchMs * 100) / 100,
    traceMs: Math.round(traceMs * 100) / 100,
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

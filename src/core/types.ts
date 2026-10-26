/** Pac-man search shared types */

export type Action = 'Up' | 'Down' | 'Left' | 'Right'

/** State: position + remaining-food bitmask */
export interface State {
  x: number
  y: number
  foodMask: number
}

export interface SearchNode {
  state: State
  g: number
  h: number
  f: number
  parent: SearchNode | null
  action: Action | null
}

export type StepKind = 'expand' | 'goal'

export interface StepEvent {
  kind: StepKind
  node: SearchNode
  /** Positions currently in OPEN (frontier) after this step */
  openCells: Array<{ x: number; y: number }>
  /** Positions in CLOSED (expanded) after this step */
  closedCells: Array<{ x: number; y: number }>
}

export interface SearchMetrics {
  algorithm: AlgorithmId
  nodesExpanded: number
  nodesGenerated: number
  pathCost: number | null
  depth: number | null
  timeMs: number
  found: boolean
  complete: boolean
  optimal: boolean | 'conditional'
}

export interface SearchResult {
  algorithm: AlgorithmId
  found: boolean
  path: SearchNode[]
  actions: Action[]
  steps: StepEvent[]
  metrics: SearchMetrics
}

export type AlgorithmId = 'BFS' | 'DFS' | 'UCS' | 'Greedy' | 'A*'

export const ALGORITHM_META: Record<
  AlgorithmId,
  { label: string; complete: boolean; optimal: boolean | 'conditional'; informed: boolean }
> = {
  BFS: { label: 'BFS', complete: true, optimal: true, informed: false },
  DFS: { label: 'DFS', complete: true, optimal: false, informed: false },
  UCS: { label: 'UCS', complete: true, optimal: true, informed: false },
  Greedy: { label: 'Greedy', complete: true, optimal: false, informed: true },
  'A*': { label: 'A*', complete: true, optimal: 'conditional', informed: true },
}

export function stateKey(s: State): string {
  return `${s.x},${s.y},${s.foodMask}`
}

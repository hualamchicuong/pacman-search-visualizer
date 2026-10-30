import { stateKey, type SearchNode, type SearchResult } from '../core/types'

export interface TreeNode {
  id: string
  label: string
  sublabel: string
  g: number
  h: number
  onPath: boolean
  isGoal: boolean
  isRoot: boolean
  /** Step index when this state was first expanded (search order) */
  discoveredAt: number
  children: TreeNode[]
  x: number
  y: number
  depth: number
}

/** Cap exploration tree size (chronological expansions, not solution-biased). */
export const MAX_TREE_NODES = 90

function bitCount(mask: number): number {
  let c = 0
  let m = mask >>> 0
  while (m) {
    c += m & 1
    m >>>= 1
  }
  return c
}

function shortLabel(n: SearchNode): string {
  return `(${n.state.x},${n.state.y})`
}

/** Binary food bitmask, zero-padded to `width` bits (same (x,y) + different F stay distinct). */
function foodMaskLabel(mask: number, width: number): string {
  const w = Math.max(1, Math.min(width, 12))
  return (mask >>> 0).toString(2).padStart(w, '0')
}

function subLabel(n: SearchNode, informed: boolean, foodBits: number): string {
  const maskBits = foodMaskLabel(n.state.foodMask, foodBits)
  if (informed) return `g=${n.g} h=${n.h.toFixed(0)} F=${maskBits}`
  return `g=${n.g} F=${maskBits}`
}

/** Strict best-g filtering makes state + g unique for each accepted occurrence. */
export function searchNodeId(node: SearchNode): string {
  return stateKey(node.state) + '@' + node.g
}

/**
 * Build a chronological exploration tree. Reopened states retain separate
 * occurrences and their original parent/g. Solution injection never rewires history.
 * Set includeSolution=false for the exploration phase of playback.
 */
export function buildSearchTree(
  result: SearchResult | null,
  upToStep?: number,
  includeSolution = true,
): TreeNode | null {
  if (!result || result.steps.length === 0) return null
  const informed = result.algorithm === 'Greedy' || result.algorithm === 'A*'
  const pathIds = new Set(includeSolution ? result.path.map(searchNodeId) : [])
  const goalId = includeSolution && result.found
    ? searchNodeId(result.path[result.path.length - 1]!) : null
  const lastStep = Math.min(upToStep ?? result.steps.length - 1, result.steps.length - 1)
  const byId = new Map<string, SearchNode>()
  const discoveredAt = new Map<string, number>()
  const children = new Map<string, string[]>()

  const ensure = (node: SearchNode, at: number): void => {
    const chain: SearchNode[] = []
    for (let cur: SearchNode | null = node; cur; cur = cur.parent) chain.push(cur)
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i]!
      const id = searchNodeId(n)
      if (byId.has(id)) continue
      byId.set(id, n)
      discoveredAt.set(id, at)
      if (n.parent) {
        const parentId = searchNodeId(n.parent)
        const list = children.get(parentId) ?? []
        list.push(id)
        children.set(parentId, list)
      }
    }
  }
  for (let i = 0; i <= lastStep; i++) {
    ensure(result.steps[i]!.node, i)
    if (byId.size >= MAX_TREE_NODES) break
  }
  if (includeSolution && result.found && result.path.length) {
    ensure(result.path[result.path.length - 1]!, lastStep)
  }
  const root = [...byId.values()].find((n) => !n.parent)
  if (!root) return null

  // Bit-width of food mask so F= labels align across nodes
  let foodBits = 1
  for (const n of byId.values()) {
    const m = n.state.foodMask >>> 0
    let w = 0
    let t = m
    while (t) {
      w++
      t >>>= 1
    }
    foodBits = Math.max(foodBits, w, bitCount(m))
  }

  const build = (id: string, depth: number): TreeNode => {
    const n = byId.get(id)!
    return {
      id,
      label: shortLabel(n),
      sublabel: subLabel(n, informed, foodBits),
      g: n.g,
      h: n.h,
      onPath: pathIds.has(id),
      isGoal: id === goalId,
      isRoot: depth === 0,
      discoveredAt: discoveredAt.get(id) ?? 0,
      children: (children.get(id) ?? []).map((child) => build(child, depth + 1)),
      x: 0,
      y: 0,
      depth,
    }
  }
  const tree = build(searchNodeId(root), 0)
  layoutTree(tree)
  return tree
}

/** Tidy layout: leaves left→right in discovery order (no path bias). */
export function layoutTree(root: TreeNode): void {
  const GAP = 1
  let next = 0

  const place = (node: TreeNode, depth: number): void => {
    node.depth = depth
    node.y = depth
    if (node.children.length === 0) {
      node.x = next
      next += GAP
      return
    }
    for (const c of node.children) place(c, depth + 1)
    node.x =
      (node.children[0]!.x + node.children[node.children.length - 1]!.x) / 2
  }
  place(root, 0)

  const sep = (node: TreeNode): void => {
    for (const c of node.children) sep(c)
    for (let i = 1; i < node.children.length; i++) {
      const prev = node.children[i - 1]!
      const cur = node.children[i]!
      const need = subtreeRight(prev) + GAP - subtreeLeft(cur)
      if (need > 0) shift(cur, need)
    }
    if (node.children.length > 0) {
      node.x =
        (node.children[0]!.x + node.children[node.children.length - 1]!.x) / 2
    }
  }
  sep(root)
}

function subtreeLeft(n: TreeNode): number {
  let m = n.x
  for (const c of n.children) m = Math.min(m, subtreeLeft(c))
  return m
}

function subtreeRight(n: TreeNode): number {
  let m = n.x
  for (const c of n.children) m = Math.max(m, subtreeRight(c))
  return m
}

function shift(n: TreeNode, dx: number): void {
  n.x += dx
  for (const c of n.children) shift(c, dx)
}

export function flattenTree(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (n: TreeNode): void => {
    out.push(n)
    for (const c of n.children) walk(c)
  }
  walk(root)
  return out
}

/** Visible subgraph: only nodes discovered at or before `step` (growing search). */
export function filterTreeByStep(root: TreeNode, step: number): TreeNode {
  const clone = (n: TreeNode): TreeNode => ({
    ...n,
    children: n.children
      .filter((c) => c.discoveredAt <= step)
      .map(clone),
  })
  const filtered = clone(root)
  layoutTree(filtered)
  return filtered
}

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

function subLabel(n: SearchNode, informed: boolean): string {
  const foods = bitCount(n.state.foodMask)
  if (informed) return `g=${n.g}  h=${n.h.toFixed(0)}  F${foods}`
  return `g=${n.g}  F${foods}`
}

/**
 * Build search tree from ACTUAL expansion order (as the algorithm explores).
 * Does NOT prefer the solution path during exploration — path is force-injected after.
 *
 * Reopen-safe: one node per stateKey, exclusive single parent; solution path FORCE-replaces.
 *
 * @param upToStep inclusive step index in result.steps (for grow-as-you-search UI)
 */
export function buildSearchTree(
  result: SearchResult | null,
  upToStep?: number,
): TreeNode | null {
  if (!result || result.steps.length === 0) return null

  const informed = result.algorithm === 'Greedy' || result.algorithm === 'A*'
  const pathKeys = new Set(result.path.map((n) => stateKey(n.state)))
  const goalKey = result.found ? stateKey(result.path[result.path.length - 1]!.state) : null

  const lastStep = Math.min(
    upToStep ?? result.steps.length - 1,
    result.steps.length - 1,
  )

  const byKey = new Map<string, SearchNode>()
  const discoveredAt = new Map<string, number>()
  const childOrder = new Map<string, string[]>()
  /** childKey → parentKey (exclusive) */
  const parentOf = new Map<string, string>()

  const rewireParent = (childKey: string, parentKey: string): void => {
    const prev = parentOf.get(childKey)
    if (prev === parentKey) {
      const list = childOrder.get(parentKey) ?? []
      if (!list.includes(childKey)) {
        list.push(childKey)
        childOrder.set(parentKey, list)
      }
      return
    }
    if (prev) {
      const oldList = childOrder.get(prev)
      if (oldList) {
        childOrder.set(
          prev,
          oldList.filter((k) => k !== childKey),
        )
      }
    }
    parentOf.set(childKey, parentKey)
    const list = childOrder.get(parentKey) ?? []
    if (!list.includes(childKey)) list.push(childKey)
    childOrder.set(parentKey, list)
  }

  const hasParent = (childKey: string): boolean => parentOf.has(childKey)

  /**
   * @param force when true (solution inject), replace payload + rewire parent to this chain
   */
  const ensure = (node: SearchNode, at: number, force: boolean): void => {
    const chain: SearchNode[] = []
    let cur: SearchNode | null = node
    while (cur) {
      chain.push(cur)
      cur = cur.parent
    }
    // Root → … → node
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i]!
      const k = stateKey(n.state)

      if (!byKey.has(k)) {
        byKey.set(k, n)
        discoveredAt.set(k, at)
      } else if (force) {
        byKey.set(k, n)
      }

      if (n.parent) {
        const pk = stateKey(n.parent.state)
        if (!byKey.has(pk)) {
          // Parent should already be in byKey from earlier in this chain walk
          continue
        }

        if (force) {
          // Path always wins: upgrade parent payload + exclusive rewire
          byKey.set(pk, n.parent)
          rewireParent(k, pk)
        } else if (!hasParent(k)) {
          // First parent only; upgrade stale parent object if worse g
          const existingParent = byKey.get(pk)!
          if (existingParent.g > n.parent.g) {
            byKey.set(pk, n.parent)
          }
          rewireParent(k, pk)
        }
        // else: already has a parent — do not add a second edge (reopen-safe)
      }
    }
  }

  for (let i = 0; i <= lastStep; i++) {
    ensure(result.steps[i]!.node, i, false)
    if (byKey.size >= MAX_TREE_NODES) break
  }

  // Force-inject solution chain / goal (path always wins on those states)
  if (result.found && result.path.length > 0) {
    ensure(result.path[result.path.length - 1]!, lastStep, true)
  }

  let rootKey: string | null = null
  for (const [k, n] of byKey) {
    if (!n.parent) {
      rootKey = k
      break
    }
  }
  if (!rootKey) {
    for (const [k, n] of byKey) {
      if (!n.parent || !byKey.has(stateKey(n.parent.state))) {
        rootKey = k
        break
      }
    }
  }
  if (!rootKey) return null

  const build = (key: string, depth: number): TreeNode => {
    const n = byKey.get(key)!
    const kids = (childOrder.get(key) ?? [])
      .filter((ck) => byKey.has(ck))
      .map((ck) => build(ck, depth + 1))
    return {
      id: key,
      label: shortLabel(n),
      sublabel: subLabel(n, informed),
      g: n.g,
      h: n.h,
      onPath: pathKeys.has(key),
      isGoal: key === goalKey,
      isRoot: depth === 0,
      discoveredAt: discoveredAt.get(key) ?? 0,
      children: kids,
      x: 0,
      y: 0,
      depth,
    }
  }

  const root = build(rootKey, 0)
  layoutTree(root)
  return root
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

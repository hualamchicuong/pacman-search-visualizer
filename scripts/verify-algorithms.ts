/**
 * Independent verification of search solvers vs clean reference implementations.
 * Run: npx tsx scripts/verify-algorithms.ts
 */
import { MAPS } from '../src/maps'
import { solve, ALGORITHMS } from '../src/search'
import { heuristic } from '../src/search/heuristic'
import { initialState, isGoal, successors } from '../src/core/problem'
import { stateKey, type State } from '../src/core/types'
import type { Maze } from '../src/core/maze'
import { generateMaze } from '../src/maps/generate'
import { buildSearchTree, flattenTree } from '../src/viz/searchTree'

/** Reference BFS — minimal steps, graph-search, no shared engine code */
function referenceBfs(maze: Maze): { cost: number; expanded: number } | null {
  const start = initialState(maze)
  const q: Array<{ s: State; g: number }> = [{ s: start, g: 0 }]
  const seen = new Set<string>([stateKey(start)])
  let expanded = 0
  let qi = 0
  while (qi < q.length) {
    const { s, g } = q[qi++]!
    expanded++
    if (isGoal(s)) return { cost: g, expanded }
    for (const { state } of successors(maze, s)) {
      const k = stateKey(state)
      if (seen.has(k)) continue
      seen.add(k)
      q.push({ s: state, g: g + 1 })
    }
  }
  return null
}

/**
 * Textbook Greedy Best-First: OPEN by min h; skip any child already in OPEN ∪ CLOSED.
 * No g-based reopen (matches course definition).
 */
function referenceGreedy(maze: Maze): { cost: number; expanded: number } | null {
  const start = initialState(maze)
  type Item = { s: State; g: number; h: number; seq: number }
  const open: Item[] = [{ s: start, g: 0, h: heuristic(maze, start), seq: 0 }]
  const seen = new Set<string>([stateKey(start)])
  let seq = 1
  let expanded = 0
  while (open.length) {
    open.sort((a, b) => a.h - b.h || a.seq - b.seq)
    const n = open.shift()!
    expanded++
    if (isGoal(n.s)) return { cost: n.g, expanded }
    for (const { state } of successors(maze, n.s)) {
      const k = stateKey(state)
      if (seen.has(k)) continue
      seen.add(k)
      open.push({ s: state, g: n.g + 1, h: heuristic(maze, state), seq: seq++ })
    }
  }
  return null
}

/** Textbook DFS graph search: LIFO; skip OPEN ∪ CLOSED */
function referenceDfs(maze: Maze): { cost: number; expanded: number } | null {
  const start = initialState(maze)
  const stack: Array<{ s: State; g: number }> = [{ s: start, g: 0 }]
  const seen = new Set<string>([stateKey(start)])
  let expanded = 0
  while (stack.length) {
    const n = stack.pop()!
    expanded++
    if (isGoal(n.s)) return { cost: n.g, expanded }
    for (const { state } of successors(maze, n.s)) {
      const k = stateKey(state)
      if (seen.has(k)) continue
      seen.add(k)
      stack.push({ s: state, g: n.g + 1 })
    }
  }
  return null
}

/** Exhaustive admissibility + consistency over all reachable states/edges. */
function checkHeuristicProperties(maze: Maze): {
  states: number
  edges: number
  admitViol: number
  consistViol: number
  goalHViol: number
} {
  const start = initialState(maze)
  const q: State[] = [start]
  const seen = new Set<string>([stateKey(start)])
  let edges = 0
  let admitViol = 0
  let consistViol = 0
  let goalHViol = 0
  let qi = 0

  // True remaining cost via BFS from each state (computed lazily)
  const trueCost = new Map<string, number | null>()
  const bfsFrom = (s0: State): number | null => {
    const k0 = stateKey(s0)
    if (trueCost.has(k0)) return trueCost.get(k0)!
    const qq: Array<{ s: State; g: number }> = [{ s: s0, g: 0 }]
    const vis = new Set<string>([k0])
    let i = 0
    while (i < qq.length) {
      const { s, g } = qq[i++]!
      if (isGoal(s)) {
        trueCost.set(k0, g)
        return g
      }
      for (const { state } of successors(maze, s)) {
        const k = stateKey(state)
        if (vis.has(k)) continue
        vis.add(k)
        qq.push({ s: state, g: g + 1 })
      }
    }
    trueCost.set(k0, null)
    return null
  }

  while (qi < q.length) {
    const s = q[qi++]!
    const h = heuristic(maze, s)
    if (isGoal(s)) {
      if (h !== 0) goalHViol++
    } else {
      const tc = bfsFrom(s)
      if (tc !== null && h > tc + 1e-9) admitViol++
    }
    for (const { state, cost } of successors(maze, s)) {
      edges++
      const hp = heuristic(maze, state)
      if (h > cost + hp + 1e-9) consistViol++
      const k = stateKey(state)
      if (!seen.has(k)) {
        seen.add(k)
        q.push(state)
      }
    }
  }

  return {
    states: seen.size,
    edges,
    admitViol,
    consistViol,
    goalHViol,
  }
}

let failed = 0

for (const mapId of Object.keys(MAPS)) {
  const maze = MAPS[mapId]!
  const ref = referenceBfs(maze)
  console.log(`\n=== MAP ${mapId} (foods=${maze.foods.length}) ===`)
  if (!ref) {
    console.log('REF BFS: NO SOLUTION')
    failed++
    continue
  }
  console.log(`REF BFS optimal cost = ${ref.cost}`)

  for (const algo of ALGORITHMS) {
    const r = solve(maze, algo)
    const cost = r.metrics.pathCost
    const okFound = r.found
    let status = 'OK'
    if (r.metrics.terminationReason === 'goal' && !okFound) {
      status = 'FAIL termination=goal but found=false'
      failed++
    }
    if (!okFound) {
      status = `FAIL (not found, stop=${r.metrics.terminationReason})`
      failed++
    } else if (algo === 'BFS' || algo === 'UCS' || algo === 'A*') {
      if (cost !== ref.cost) {
        status = `FAIL optimal: got ${cost} expected ${ref.cost}`
        failed++
      }
    } else {
      // DFS / Greedy: must be >= optimal
      if (cost! < ref.cost) {
        status = `FAIL better-than-optimal: got ${cost} < ${ref.cost}`
        failed++
      } else if (cost! > ref.cost) {
        status = `OK suboptimal (expected possible) cost=${cost}`
      }
    }
    console.log(
      `  ${algo.padEnd(7)} cost=${cost} exp=${r.metrics.nodesExpanded} gen=${r.metrics.nodesGenerated} ms=${r.metrics.timeMs} → ${status}`,
    )
  }

  // BFS must match UCS cost
  const bfs = solve(maze, 'BFS')
  const ucs = solve(maze, 'UCS')
  if (bfs.metrics.pathCost !== ucs.metrics.pathCost) {
    console.log('  FAIL BFS cost != UCS cost')
    failed++
  }

  // Textbook Greedy / DFS must match engine exactly
  const greedy = solve(maze, 'Greedy')
  const refG = referenceGreedy(maze)
  if (!refG || greedy.metrics.pathCost !== refG.cost || greedy.metrics.nodesExpanded !== refG.expanded) {
    console.log(
      `  FAIL Greedy vs textbook: app cost=${greedy.metrics.pathCost} exp=${greedy.metrics.nodesExpanded} ref cost=${refG?.cost} exp=${refG?.expanded}`,
    )
    failed++
  } else {
    console.log(`  Greedy matches textbook (cost=${refG.cost} exp=${refG.expanded})`)
  }

  const dfs = solve(maze, 'DFS')
  const refD = referenceDfs(maze)
  if (!refD || dfs.metrics.pathCost !== refD.cost || dfs.metrics.nodesExpanded !== refD.expanded) {
    console.log(
      `  FAIL DFS vs textbook: app cost=${dfs.metrics.pathCost} exp=${dfs.metrics.nodesExpanded} ref cost=${refD?.cost} exp=${refD?.expanded}`,
    )
    failed++
  } else {
    console.log(`  DFS matches textbook (cost=${refD.cost} exp=${refD.expanded})`)
  }

  const heur = checkHeuristicProperties(maze)
  console.log(
    `  Heuristic: states=${heur.states} edges=${heur.edges} admitViol=${heur.admitViol} consistViol=${heur.consistViol} goalHViol=${heur.goalHViol}`,
  )
  if (heur.admitViol > 0 || heur.consistViol > 0 || heur.goalHViol > 0) failed++

  // Tree: exploration-order layout; solution chain injected when found
  const tree = buildSearchTree(bfs)
  if (tree) {
    const nodes = flattenTree(tree)
    const pathNodes = nodes.filter((n) => n.onPath)
    const hasGoal = nodes.some((n) => n.isGoal)
    if (bfs.found && !hasGoal) {
      console.log('  FAIL tree missing goal after inject')
      failed++
    }
    for (let i = 1; i < bfs.path.length; i++) {
      const a = bfs.path[i - 1]!.state
      const b = bfs.path[i]!.state
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      if (dist !== 1) {
        console.log(`  FAIL path not unit steps at ${i}`)
        failed++
        break
      }
    }
    console.log(
      `  Tree: nodes=${nodes.length} pathNodes=${pathNodes.length} hasGoal=${hasGoal} (exploration order + path inject)`,
    )
  }
}

// Generated maps: Greedy / DFS must match textbook on ~50 seeds
console.log('\n=== Generated maps: textbook Greedy/DFS match ===')
{
  let compared = 0
  for (let seed = 0; seed < 80 && compared < 50; seed++) {
    try {
      const g = generateMaze({
        size: seed % 2 === 0 ? 'small' : 'medium',
        foodCount: 4 + (seed % 3),
        startExits: ((seed % 3) + 2) as 2 | 3 | 4,
        foodsAtCorners: seed % 5 === 0,
        seed,
      })
      const appG = solve(g.maze, 'Greedy')
      const refG = referenceGreedy(g.maze)
      const appD = solve(g.maze, 'DFS')
      const refD = referenceDfs(g.maze)
      compared++
      if (
        !refG ||
        appG.metrics.pathCost !== refG.cost ||
        appG.metrics.nodesExpanded !== refG.expanded
      ) {
        console.log(`  FAIL Greedy seed=${seed}`)
        failed++
      }
      if (
        !refD ||
        appD.metrics.pathCost !== refD.cost ||
        appD.metrics.nodesExpanded !== refD.expanded
      ) {
        console.log(`  FAIL DFS seed=${seed}`)
        failed++
      }
    } catch {
      /* skip failed gens */
    }
  }
  console.log(`  Compared ${compared} generated maps`)
  if (compared < 40) {
    console.log('  FAIL fewer than 40 generated comparisons')
    failed++
  }
}

console.log(`\n=== SUMMARY: ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' FAILURE(S)'} ===`)
process.exit(failed === 0 ? 0 : 1)

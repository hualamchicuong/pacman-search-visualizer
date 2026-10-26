/**
 * Independent verification of search solvers vs a clean reference BFS.
 * Run: npx tsx scripts/verify-algorithms.ts
 */
import { MAPS } from '../src/maps'
import { solve, ALGORITHMS } from '../src/search'
import { heuristic } from '../src/search/heuristic'
import { initialState, isGoal, successors } from '../src/core/problem'
import { stateKey, type State } from '../src/core/types'
import type { Maze } from '../src/core/maze'
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

/** Sample admissibility: h(n) <= true remaining cost from n (via ref BFS from that state). */
function checkAdmissibleSample(maze: Maze, samples: number): {
  checked: number
  violations: number
  worstGap: number
} {
  // BFS from start collecting some CLOSED states
  const start = initialState(maze)
  const q: State[] = [start]
  const seen = new Set<string>([stateKey(start)])
  const states: State[] = []
  let qi = 0
  while (qi < q.length && states.length < samples * 3) {
    const s = q[qi++]!
    if (!isGoal(s)) states.push(s)
    for (const { state } of successors(maze, s)) {
      const k = stateKey(state)
      if (seen.has(k)) continue
      seen.add(k)
      q.push(state)
    }
  }

  // Pick evenly spaced samples
  const picked: State[] = []
  const step = Math.max(1, Math.floor(states.length / samples))
  for (let i = 0; i < states.length && picked.length < samples; i += step) {
    picked.push(states[i]!)
  }

  let violations = 0
  let worstGap = 0
  for (const s of picked) {
    const h = heuristic(maze, s)
    // True remaining: BFS from this state as "start" with same food mask
    const trueCost = bfsFrom(maze, s)
    if (trueCost === null) continue
    if (h > trueCost + 1e-9) {
      violations++
      worstGap = Math.max(worstGap, h - trueCost)
    }
  }
  return { checked: picked.length, violations, worstGap }
}

function bfsFrom(maze: Maze, start: State): number | null {
  const q: Array<{ s: State; g: number }> = [{ s: start, g: 0 }]
  const seen = new Set<string>([stateKey(start)])
  let qi = 0
  while (qi < q.length) {
    const { s, g } = q[qi++]!
    if (isGoal(s)) return g
    for (const { state } of successors(maze, s)) {
      const k = stateKey(state)
      if (seen.has(k)) continue
      seen.add(k)
      q.push({ s: state, g: g + 1 })
    }
  }
  return null
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
    if (!okFound) {
      status = 'FAIL (not found)'
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
      `  ${algo.padEnd(7)} cost=${cost} exp=${r.metrics.nodesExpanded} → ${status}`,
    )
  }

  // BFS must match UCS cost
  const bfs = solve(maze, 'BFS')
  const ucs = solve(maze, 'UCS')
  if (bfs.metrics.pathCost !== ucs.metrics.pathCost) {
    console.log('  FAIL BFS cost != UCS cost')
    failed++
  }

  const adm = checkAdmissibleSample(maze, 25)
  console.log(
    `  Heuristic admissibility samples: checked=${adm.checked} violations=${adm.violations} worstGap=${adm.worstGap}`,
  )
  if (adm.violations > 0) failed++

  // Tree layout: path child is sorted first → leftmost (visual bias, not algo)
  const tree = buildSearchTree(bfs)
  if (tree) {
    const nodes = flattenTree(tree)
    const pathNodes = nodes.filter((n) => n.onPath)
    const avgPathX =
      pathNodes.reduce((a, n) => a + n.x, 0) / Math.max(pathNodes.length, 1)
    const avgAllX = nodes.reduce((a, n) => a + n.x, 0) / nodes.length
    console.log(
      `  Tree layout: nodes=${nodes.length} avgPathX=${avgPathX.toFixed(2)} avgAllX=${avgAllX.toFixed(2)} (path first → tends LEFT)`,
    )
  }
}

console.log(`\n=== SUMMARY: ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' FAILURE(S)'} ===`)
process.exit(failed === 0 ? 0 : 1)

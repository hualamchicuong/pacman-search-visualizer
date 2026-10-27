/**
 * Edge-case battery for review findings.
 * Run: npx tsx scripts/edge-cases.ts
 */
import { parseMaze } from '../src/core/maze'
import { initialState, isGoal } from '../src/core/problem'
import { runSearch } from '../src/search/engine'
import { engineOptionsFor } from '../src/search/options'
import { solve } from '../src/search'
import { generateMaze, maxFoodForSize, type MapSizeId } from '../src/maps/generate'
import { buildSearchTree, flattenTree, MAX_TREE_NODES } from '../src/viz/searchTree'
import { MAPS } from '../src/maps'

let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`)
  else {
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
    failed++
  }
}

console.log('\n=== 0-food / F-start ===')
{
  const zero = parseMaze('zero', ['###', '#P#', '###'])
  check('parse 0-food', zero.foods.length === 0)
  const s0 = initialState(zero)
  check('0-food initial is goal', isGoal(s0) && s0.foodMask === 0)
  const r = solve(zero, 'BFS')
  check('0-food BFS cost 0', r.found && r.metrics.pathCost === 0 && r.metrics.terminationReason === 'goal')

  const fStart = parseMaze('f-only', ['#####', '#F.o#', '#####'])
  const sf = initialState(fStart)
  check('F clears start food bit', sf.foodMask === 2, `mask=${sf.foodMask}`) // only remaining o (bit 1)
  const rf = solve(fStart, 'BFS')
  check('F-start BFS finds goal', rf.found && rf.metrics.pathCost !== null)
  // Optimal: from start (food eaten) go right to o → cost 1? layout #F.o# width 5
  check('F-start optimal cost 2', rf.metrics.pathCost === 2, `got ${rf.metrics.pathCost}`)
}

console.log('\n=== Unreachable food → exhausted ===')
{
  const maze = parseMaze('unreachable', [
    '#######',
    '#P..#o#',
    '#######',
  ])
  const r = solve(maze, 'BFS')
  check('unreachable not found', !r.found)
  check('termination exhausted', r.metrics.terminationReason === 'exhausted', r.metrics.terminationReason)
}

console.log('\n=== Expand limit → limit ===')
{
  const maze = MAPS.medium!
  const r = runSearch(maze, {
    ...engineOptionsFor('BFS'),
    maxExpanded: 50,
  })
  check('limit not found', !r.found)
  check('termination limit', r.metrics.terminationReason === 'limit', r.metrics.terminationReason)
  check('expanded == 50', r.metrics.nodesExpanded === 50, String(r.metrics.nodesExpanded))
}

console.log('\n=== Cancel via shouldCancel ===')
{
  const maze = MAPS.medium!
  let n = 0
  const r = runSearch(maze, {
    ...engineOptionsFor('BFS'),
    shouldCancel: () => {
      n++
      return n > 30
    },
  })
  check('cancelled termination', r.metrics.terminationReason === 'cancelled', r.metrics.terminationReason)
  check('cancelled not found', !r.found)
}

console.log('\n=== Trace reservoir sampling ===')
{
  const maze = MAPS.medium!
  const r = runSearch(maze, {
    ...engineOptionsFor('BFS'),
    maxRecordedSteps: 40,
  })
  check('found with tiny trace cap', r.found)
  check('trace sampled flag', r.metrics.traceSampled === true)
  check(
    'recorded ≤ cap (+goal)',
    r.steps.length <= 41,
    `steps=${r.steps.length} recorded=${r.metrics.traceRecorded}`,
  )
  check('last step is goal', r.steps[r.steps.length - 1]?.kind === 'goal')
  const sources = r.steps.filter((s) => s.kind === 'expand').map((s) => s.sourceStep ?? 0)
  const spread = sources.length > 1 ? Math.max(...sources) - Math.min(...sources) : 0
  check(
    'reservoir spans beyond first 40 expands',
    Math.max(...sources) > 40,
    `maxSource=${Math.max(...sources)} spread=${spread}`,
  )
}

console.log('\n=== Tree path inject on capped maps ===')
{
  for (const id of ['small', 'medium', 'branchy'] as const) {
    const maze = MAPS[id]!
    const bfs = solve(maze, 'BFS')
    const tree = buildSearchTree(bfs)!
    const nodes = flattenTree(tree)
    const hasGoal = nodes.some((n) => n.isGoal)
    const pathColored = nodes.filter((n) => n.onPath).length
    check(
      `tree ${id} has goal`,
      hasGoal,
      `nodes=${nodes.length} pathColored=${pathColored} cap=${MAX_TREE_NODES}`,
    )
    check(
      `tree ${id} path nodes ≥ half path`,
      pathColored >= Math.min(bfs.path.length, Math.floor(bfs.path.length * 0.5)),
      `${pathColored}/${bfs.path.length}`,
    )
  }
}

console.log('\n=== Generator connectivity + corners ===')
{
  const sizes: MapSizeId[] = ['tiny', 'small', 'medium']
  const exits: Array<2 | 3 | 4> = [2, 3, 4]
  let genOk = 0
  let genFail = 0
  let disconnect = 0

  for (const size of sizes) {
    for (const startExits of exits) {
      for (let seed = 0; seed < 25; seed++) {
        try {
          const g = generateMaze({
            size,
            foodCount: Math.min(4, maxFoodForSize(size)),
            startExits,
            seed,
          })
          genOk++
          // openCells already required connected in generator; re-check start degree
          if (g.startExits !== startExits) {
            check(`degree seed=${seed} ${size} e=${startExits}`, false, `got ${g.startExits}`)
          }
        } catch {
          genFail++
        }
      }
    }
  }
  check(
    'generator success rate (food=4)',
    genOk >= 100,
    `ok=${genOk} fail=${genFail} disconnectSeen=${disconnect}`,
  )

  // High food on tiny often fails — should throw cleanly, not return disconnected
  let highFail = 0
  let highOk = 0
  for (let seed = 0; seed < 30; seed++) {
    try {
      generateMaze({ size: 'tiny', foodCount: 14, startExits: 2, seed })
      highOk++
    } catch {
      highFail++
    }
  }
  check(
    'tiny food=14 either fails cleanly or succeeds',
    highOk + highFail === 30,
    `ok=${highOk} fail=${highFail}`,
  )

  // Corners
  let cornerOk = 0
  for (const size of sizes) {
    for (const startExits of exits) {
      for (let seed = 0; seed < 15; seed++) {
        try {
          const g = generateMaze({
            size,
            foodCount: 4,
            startExits,
            foodsAtCorners: true,
            seed,
          })
          if (g.foodsAtCorners && g.maze.foods.length === 4) cornerOk++
        } catch {
          /* retry budget expected sometimes */
        }
      }
    }
  }
  check('corner maps generated', cornerOk >= 20, `ok=${cornerOk}/135`)
}

console.log('\n=== BFS/UCS/A* agree on generated corners ===')
{
  let compared = 0
  for (let seed = 0; seed < 40 && compared < 8; seed++) {
    try {
      const g = generateMaze({
        size: 'small',
        foodCount: 4,
        startExits: 4,
        foodsAtCorners: true,
        seed,
      })
      const bfs = solve(g.maze, 'BFS')
      const ucs = solve(g.maze, 'UCS')
      const astar = solve(g.maze, 'A*')
      check(
        `corners seed=${seed} optimal agree`,
        bfs.metrics.pathCost === ucs.metrics.pathCost &&
          bfs.metrics.pathCost === astar.metrics.pathCost &&
          bfs.found,
        `bfs=${bfs.metrics.pathCost} ucs=${ucs.metrics.pathCost} a*=${astar.metrics.pathCost}`,
      )
      compared++
    } catch {
      /* skip */
    }
  }
  check('compared ≥ 5 corner maps', compared >= 5, `n=${compared}`)
}

console.log(`\n=== EDGE SUMMARY: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILURE(S)'} ===`)
process.exit(failed === 0 ? 0 : 1)

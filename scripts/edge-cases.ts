/**
 * Edge-case battery for review findings.
 * Run: npx tsx scripts/edge-cases.ts
 */
import { parseMaze, type Maze } from '../src/core/maze'
import { initialState, isGoal } from '../src/core/problem'
import { runSearch } from '../src/search/engine'
import { engineOptionsFor } from '../src/search/options'
import { solve } from '../src/search'
import { generateMaze, GenerateError, maxFoodForSize, type MapSizeId } from '../src/maps/generate'
import { buildSearchTree, flattenTree, filterTreeByStep, searchNodeId, MAX_TREE_NODES } from '../src/viz/searchTree'
import { MAPS } from '../src/maps'

let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`)
  else {
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
    failed++
  }
}

/** Independent connectivity/food check, without trusting generator metadata. */
function connectedMaze(maze: Maze): boolean {
  const queue = [maze.start]
  const seen = new Set([maze.start.x + ',' + maze.start.y])
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i]!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx!, ny = y + dy!
      const key = nx + ',' + ny
      if (nx < 0 || ny < 0 || nx >= maze.width || ny >= maze.height || maze.walls[ny]![nx] || seen.has(key)) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  const opens = maze.walls.flat().filter(wall => !wall).length
  return seen.size === opens && maze.foods.every(f => seen.has(f.x + ',' + f.y))
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

console.log('\n=== M2 terminal pin when no goal ===')
{
  const maze = MAPS.medium!
  const r = runSearch(maze, {
    ...engineOptionsFor('BFS'),
    maxRecordedSteps: 1,
    maxExpanded: 50,
  })
  check('limit stop', r.metrics.terminationReason === 'limit')
  check('expanded 50', r.metrics.nodesExpanded === 50)
  const expandSteps = r.steps.filter((s) => s.kind === 'expand')
  const maxSrc = Math.max(...expandSteps.map((s) => s.sourceStep ?? 0), 0)
  check(
    'terminal expand sourceStep === 50',
    maxSrc === 50,
    `maxSrc=${maxSrc} steps=${r.steps.length}`,
  )
}

console.log('\n=== m2 goal sourceStep === nodesExpanded ===')
{
  const maze = MAPS.medium!
  const r = solve(maze, 'BFS')
  const goal = r.steps[r.steps.length - 1]
  check('goal event', goal?.kind === 'goal')
  check(
    'goal sourceStep === nodesExpanded',
    goal?.sourceStep === r.metrics.nodesExpanded,
    `src=${goal?.sourceStep} expanded=${r.metrics.nodesExpanded}`,
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
      `tree ${id} contains complete solution`,
      pathColored === bfs.path.length,
      `${pathColored}/${bfs.path.length}`,
    )
    // Edge g-monotonicity
    let badEdge = 0
    const walk = (n: (typeof nodes)[0]): void => {
      for (const c of n.children) {
        if (c.g !== n.g + 1) badEdge++
        walk(c)
      }
    }
    walk(tree)
    check(`tree ${id} unit-cost tree edges`, badEdge === 0, `bad=${badEdge}`)
  }
}

console.log('\n=== M1 Greedy reopen tree (seed=24 corners) ===')
{
  try {
    const g = generateMaze({
      size: 'small',
      foodCount: 4,
      startExits: 2,
      foodsAtCorners: true,
      seed: 24,
    })
    const greedy = solve(g.maze, 'Greedy')
    check('greedy found', greedy.found, `cost=${greedy.metrics.pathCost}`)
    const tree = buildSearchTree(greedy)!
    const nodes = flattenTree(tree)
    const ids = nodes.map((n) => n.id)
    check('unique tree node ids', new Set(ids).size === ids.length, `n=${ids.length}`)

    let dupChild = 0
    let badEdge = 0
    const walk = (n: (typeof nodes)[0]): void => {
      const seen = new Set<string>()
      for (const c of n.children) {
        if (seen.has(c.id)) dupChild++
        seen.add(c.id)
        if (c.g !== n.g + 1) badEdge++
        walk(c)
      }
    }
    walk(tree)
    check('no duplicate child under same parent', dupChild === 0, `dup=${dupChild}`)
    check('unit-cost tree edges', badEdge === 0, `bad=${badEdge}`)
    check('has goal', nodes.some((n) => n.isGoal))

    // Path edges exist in tree
    let pathOk = true
    for (let i = 1; i < greedy.path.length; i++) {
      const a = greedy.path[i - 1]!
      const b = greedy.path[i]!
      const dist =
        Math.abs(a.state.x - b.state.x) + Math.abs(a.state.y - b.state.y)
      if (dist !== 1) pathOk = false
    }
    check('greedy path unit steps', pathOk)
    check('solution edges exist and are colored', greedy.path.slice(1).every((node, i) => {
      const parent = nodes.find(n => n.id === searchNodeId(greedy.path[i]!))
      return parent?.onPath && parent.children.some(c => c.id === searchNodeId(node) && c.onPath)
    }))

    const exploration = buildSearchTree(greedy, undefined, false)!
    const beforeSolution = JSON.stringify(exploration)
    const frame = filterTreeByStep(exploration, 18)
    const current = greedy.steps[18]!.node
    check('event 19 remains visible before solution reveal',
      flattenTree(frame).some(n => n.id === searchNodeId(current) && n.g === current.g))
    check('exploration carries no future path coloring',
      flattenTree(exploration).every(n => !n.onPath && !n.isGoal))
    buildSearchTree(greedy)
    check('solution construction preserves exploration history', JSON.stringify(exploration) === beforeSolution)
    const back = filterTreeByStep(exploration, 18)
    check('stepping back restores exploration frame', JSON.stringify(back) === JSON.stringify(frame))
  } catch (err) {
    check('generate seed=24', false, err instanceof Error ? err.message : String(err))
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
          if (!connectedMaze(g.maze)) disconnect++
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
    'generator connected with reachable foods (food=4)',
    genOk === 225 && genFail === 0 && disconnect === 0,
    `ok=${genOk} fail=${genFail} disconnectSeen=${disconnect}`,
  )

  // High food on tiny often fails — should throw cleanly, not return disconnected
  let highFail = 0
  let highOk = 0
  for (let seed = 0; seed < 30; seed++) {
    try {
      const generated = generateMaze({ size: 'tiny', foodCount: 14, startExits: 2, seed })
      check('high food success respects constraints',
        connectedMaze(generated.maze) && generated.maze.foods.length === 14)
      highOk++
    } catch (err) {
      check('high food fails with actionable GenerateError',
        err instanceof GenerateError && /100 tries/.test(err.message))
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
          const slots = new Set(['1,1', (g.maze.width - 2) + ',1', '1,' + (g.maze.height - 2), (g.maze.width - 2) + ',' + (g.maze.height - 2)])
          if (g.foodsAtCorners && g.maze.foods.length === 4 && connectedMaze(g.maze) &&
              g.maze.foods.every(f => slots.has(f.x + ',' + f.y)) &&
              !slots.has(g.maze.start.x + ',' + g.maze.start.y) && g.startExits === startExits) cornerOk++
        } catch {
          /* retry budget expected sometimes */
        }
      }
    }
  }
  check('corner maps generated', cornerOk === 135, `ok=${cornerOk}/135`)
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

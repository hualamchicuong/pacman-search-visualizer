import { MAPS } from '../src/maps'
import { solve, ALGORITHMS } from '../src/search'

for (const mapId of Object.keys(MAPS)) {
  const maze = MAPS[mapId]
  console.log(`MAP ${mapId} foods=${maze.foods.length} ${maze.width}x${maze.height}`)
  for (const algo of ALGORITHMS) {
    const r = solve(maze, algo)
    console.log(
      `  ${algo.padEnd(7)} found=${r.found} cost=${r.metrics.pathCost} exp=${r.metrics.nodesExpanded} gen=${r.metrics.nodesGenerated} ms=${r.metrics.timeMs}`,
    )
  }
}

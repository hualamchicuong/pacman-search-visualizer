import type { Maze } from '../core/maze'
import type { AlgorithmId, SearchResult } from '../core/types'
import { runSearch } from './engine'
import { engineOptionsFor } from './options'

export const ALGORITHMS: AlgorithmId[] = ['BFS', 'DFS', 'UCS', 'Greedy', 'A*']

/** Sync solve — used by Node verify scripts. */
export function solve(maze: Maze, algorithm: AlgorithmId): SearchResult {
  return runSearch(maze, engineOptionsFor(algorithm))
}

export { heuristic } from './heuristic'
export { runSearch, runSearchAsync } from './engine'
export { engineOptionsFor } from './options'

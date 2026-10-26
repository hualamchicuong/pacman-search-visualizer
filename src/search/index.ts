import type { Maze } from '../core/maze'
import type { AlgorithmId, SearchResult } from '../core/types'
import { runSearch } from './engine'

export const ALGORITHMS: AlgorithmId[] = ['BFS', 'DFS', 'UCS', 'Greedy', 'A*']

export function solve(maze: Maze, algorithm: AlgorithmId): SearchResult {
  switch (algorithm) {
    case 'BFS':
      return runSearch(maze, { algorithm, frontier: 'fifo', useHeuristic: false })
    case 'DFS':
      return runSearch(maze, { algorithm, frontier: 'lifo', useHeuristic: false })
    case 'UCS':
      return runSearch(maze, { algorithm, frontier: 'ucs', useHeuristic: false })
    case 'Greedy':
      return runSearch(maze, { algorithm, frontier: 'greedy', useHeuristic: true })
    case 'A*':
      return runSearch(maze, { algorithm, frontier: 'astar', useHeuristic: true })
  }
}

export { heuristic } from './heuristic'

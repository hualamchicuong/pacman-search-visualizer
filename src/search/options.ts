import type { AlgorithmId } from '../core/types'
import type { EngineOptions } from './engine'

export function engineOptionsFor(
  algorithm: AlgorithmId,
  extra?: Partial<EngineOptions>,
): EngineOptions {
  const base: EngineOptions = (() => {
    switch (algorithm) {
      case 'BFS':
        return { algorithm, frontier: 'fifo', useHeuristic: false }
      case 'DFS':
        return { algorithm, frontier: 'lifo', useHeuristic: false }
      case 'UCS':
        return { algorithm, frontier: 'ucs', useHeuristic: false }
      case 'Greedy':
        return { algorithm, frontier: 'greedy', useHeuristic: true }
      case 'A*':
        return { algorithm, frontier: 'astar', useHeuristic: true }
    }
  })()
  return { ...base, ...extra }
}

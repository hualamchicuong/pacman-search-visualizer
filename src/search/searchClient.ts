import type { Maze } from '../core/maze'
import type { AlgorithmId, SearchResult } from '../core/types'
import type { WorkerInMsg, WorkerOutMsg } from './worker'

export class SearchCancelledError extends Error {
  constructor(message = 'Search cancelled') {
    super(message)
    this.name = 'SearchCancelledError'
  }
}

type Pending = {
  resolve: (r: SearchResult) => void
  reject: (e: Error) => void
}

class WorkerSlot {
  private worker: Worker
  private pending = new Map<string, Pending>()
  private seq = 0

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<WorkerOutMsg>) => {
      const msg = ev.data
      const p = this.pending.get(msg.jobId)
      if (!p) return
      this.pending.delete(msg.jobId)
      if (msg.type === 'done') p.resolve(msg.result)
      else p.reject(new SearchCancelledError())
    }
    this.worker.onerror = (err) => {
      console.error('Search worker error', err)
      for (const [id, p] of this.pending) {
        p.reject(new Error(err.message || 'Worker error'))
        this.pending.delete(id)
      }
    }
  }

  get busy(): boolean {
    return this.pending.size > 0
  }

  solve(maze: Maze, algorithm: AlgorithmId): Promise<SearchResult> {
    const jobId = `job-${++this.seq}-${Math.random().toString(36).slice(2, 8)}`
    return new Promise<SearchResult>((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject })
      const msg: WorkerInMsg = { type: 'run', jobId, maze, algorithm }
      this.worker.postMessage(msg)
    })
  }

  cancelAll(): void {
    const msg: WorkerInMsg = { type: 'cancelAll' }
    this.worker.postMessage(msg)
    for (const [id, p] of this.pending) {
      p.reject(new SearchCancelledError())
      this.pending.delete(id)
    }
  }
}

/** Two workers so Compare can run algorithms in parallel. */
const slotA = new WorkerSlot()
const slotB = new WorkerSlot()

export function isSearchBusy(): boolean {
  return slotA.busy || slotB.busy
}

export function cancelAllSearches(): void {
  slotA.cancelAll()
  slotB.cancelAll()
}

export function solveAsync(maze: Maze, algorithm: AlgorithmId): Promise<SearchResult> {
  const slot = slotA.busy && !slotB.busy ? slotB : slotA
  return slot.solve(maze, algorithm)
}

/** Parallel solve for Compare mode (one job per worker). */
export function solveCompareAsync(
  maze: Maze,
  algoA: AlgorithmId,
  algoB: AlgorithmId,
): Promise<[SearchResult, SearchResult]> {
  return Promise.all([slotA.solve(maze, algoA), slotB.solve(maze, algoB)])
}

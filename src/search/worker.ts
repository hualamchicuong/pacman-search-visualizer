/// <reference lib="webworker" />
import type { Maze } from '../core/maze'
import type { AlgorithmId, SearchResult } from '../core/types'
import { runSearchAsync } from './engine'
import { engineOptionsFor } from './options'

export type WorkerInMsg =
  | { type: 'run'; jobId: string; maze: Maze; algorithm: AlgorithmId }
  | { type: 'cancel'; jobId: string }
  | { type: 'cancelAll' }

export type WorkerOutMsg =
  | { type: 'done'; jobId: string; result: SearchResult }
  | { type: 'aborted'; jobId: string }

const cancelled = new Set<string>()
let activeJobId: string | null = null

self.onmessage = (ev: MessageEvent<WorkerInMsg>) => {
  const msg = ev.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.jobId)
    return
  }
  if (msg.type === 'cancelAll') {
    if (activeJobId) cancelled.add(activeJobId)
    return
  }
  if (msg.type === 'run') {
    void handleRun(msg.jobId, msg.maze, msg.algorithm)
  }
}

async function handleRun(jobId: string, maze: Maze, algorithm: AlgorithmId): Promise<void> {
  cancelled.delete(jobId)
  activeJobId = jobId
  try {
    const result = await runSearchAsync(
      maze,
      engineOptionsFor(algorithm, {
        shouldCancel: () => cancelled.has(jobId),
      }),
      256,
    )
    if (cancelled.has(jobId) || result.metrics.terminationReason === 'cancelled') {
      const out: WorkerOutMsg = { type: 'aborted', jobId }
      self.postMessage(out)
    } else {
      const out: WorkerOutMsg = { type: 'done', jobId, result }
      self.postMessage(out)
    }
  } catch (err) {
    console.error(err)
    const out: WorkerOutMsg = { type: 'aborted', jobId }
    self.postMessage(out)
  } finally {
    if (activeJobId === jobId) activeJobId = null
    cancelled.delete(jobId)
  }
}

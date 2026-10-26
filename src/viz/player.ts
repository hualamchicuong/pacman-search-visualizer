import type { SearchResult } from '../core/types'
import type { FrameState } from './canvasRenderer'

export type PlayerListener = (frame: FrameState, playing: boolean) => void

/**
 * Plays through search expansion steps, then solution path.
 * Timeline: [expand steps...] + [path cells...]
 */
export class TracePlayer {
  private result: SearchResult | null = null
  private index = 0
  private playing = false
  private timer: number | null = null
  private speed = 12 // steps per second
  private listeners = new Set<PlayerListener>()

  setResult(result: SearchResult | null): void {
    this.pause()
    this.result = result
    this.index = 0
    this.emit()
  }

  getResult(): SearchResult | null {
    return this.result
  }

  setSpeed(stepsPerSec: number): void {
    this.speed = Math.max(1, stepsPerSec)
    if (this.playing) {
      this.pause()
      this.play()
    }
  }

  onChange(fn: PlayerListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get length(): number {
    if (!this.result) return 1
    const pathPart = this.result.found ? this.result.path.length : 0
    return Math.max(1, this.result.steps.length + pathPart)
  }

  get frame(): FrameState {
    if (!this.result || this.result.steps.length === 0) {
      return { stepIndex: 0, event: null, showPath: false, pathIndex: 0 }
    }
    const nSteps = this.result.steps.length
    if (this.index < nSteps) {
      return {
        stepIndex: this.index,
        event: this.result.steps[this.index],
        showPath: false,
        pathIndex: 0,
      }
    }
    const pathIndex = Math.min(this.index - nSteps, Math.max(0, this.result.path.length - 1))
    return {
      stepIndex: this.index,
      event: this.result.steps[nSteps - 1] ?? null,
      showPath: this.result.found,
      pathIndex,
    }
  }

  play(): void {
    if (!this.result || this.playing) return
    if (this.index >= this.length - 1) this.index = 0
    this.playing = true
    this.emit()
    const tick = (): void => {
      this.stepForward()
      if (this.index >= this.length - 1) {
        this.pause()
        return
      }
      this.timer = window.setTimeout(tick, 1000 / this.speed)
    }
    this.timer = window.setTimeout(tick, 1000 / this.speed)
  }

  pause(): void {
    this.playing = false
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  reset(): void {
    this.pause()
    this.index = 0
    this.emit()
  }

  stepForward(): void {
    if (!this.result) return
    this.index = Math.min(this.index + 1, this.length - 1)
    this.emit()
  }

  stepBack(): void {
    this.index = Math.max(this.index - 1, 0)
    this.emit()
  }

  isPlaying(): boolean {
    return this.playing
  }

  private emit(): void {
    const f = this.frame
    for (const fn of this.listeners) fn(f, this.playing)
  }
}

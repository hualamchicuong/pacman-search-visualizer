import './style.css'
import { MAPS } from './maps'
import { solve } from './search'
import { stateKey, type SearchResult } from './core/types'
import { CanvasRenderer } from './viz/canvasRenderer'
import { TracePlayer } from './viz/player'
import { TreeRenderer } from './viz/treeRenderer'
import { buildSearchTree } from './viz/searchTree'
import { bindControls } from './ui/controls'
import { renderInsight, renderMetrics } from './ui/metrics'

const canvasA = document.querySelector('#canvas-a') as HTMLCanvasElement
const canvasB = document.querySelector('#canvas-b') as HTMLCanvasElement
const treeViewA = document.querySelector('#tree-a') as HTMLElement
const treeViewB = document.querySelector('#tree-b') as HTMLElement
const treeCapA = document.querySelector('#tree-a-caption') as HTMLElement
const treeCapB = document.querySelector('#tree-b-caption') as HTMLElement
const panelB = document.querySelector('#panel-b') as HTMLElement
const panels = document.querySelector('#panels') as HTMLElement
const titleA = document.querySelector('#panel-a-title') as HTMLElement
const titleB = document.querySelector('#panel-b-title') as HTMLElement
const stepA = document.querySelector('#panel-a-step') as HTMLElement
const stepB = document.querySelector('#panel-b-step') as HTMLElement
const infoA = document.querySelector('#panel-a-info') as HTMLElement
const infoB = document.querySelector('#panel-b-info') as HTMLElement
const metricsEl = document.querySelector('#metrics-table') as HTMLElement
const insightEl = document.querySelector('#insight') as HTMLElement

const rendererA = CanvasRenderer.attach(canvasA)
const rendererB = CanvasRenderer.attach(canvasB)
const treeA = TreeRenderer.attach(treeViewA, treeCapA)
const treeB = TreeRenderer.attach(treeViewB, treeCapB)
const playerA = new TracePlayer()
const playerB = new TracePlayer()

let lastResults: SearchResult[] = []

const controls = bindControls((state) => {
  playerA.setSpeed(state.speed)
  playerB.setSpeed(state.speed)
  updateLayout(state.mode)
})

function updateLayout(mode: 'single' | 'compare'): void {
  const compare = mode === 'compare'
  panelB.classList.toggle('hidden', !compare)
  panels.classList.toggle('compare', compare)
  // Wait for CSS reflow, then redraw + refit (fixes stretch when leaving Compare)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      refreshAfterLayout()
    })
  })
}

function refreshAfterLayout(): void {
  if (lastResults.length === 0) {
    drawIdle()
    return
  }
  redraw()
  treeA.fitToView()
  if (controls.get().mode === 'compare') {
    treeB.fitToView()
  }
}

function formatNodeInfo(result: SearchResult | null, player: TracePlayer): string {
  const frame = player.frame
  if (!result) return 'Run an algorithm to begin.'
  if (frame.showPath) {
    return `Path ${frame.pathIndex + 1}/${result.path.length} · cost ${result.metrics.pathCost}`
  }
  const n = frame.event?.node
  if (!n) return '—'
  const informed = result.algorithm === 'Greedy' || result.algorithm === 'A*'
  const base = `expand g=${n.g}` + (informed ? ` h=${n.h.toFixed(1)} f=${n.f.toFixed(1)}` : '')
  return `${base} · foodMask=${n.state.foodMask} @ (${n.state.x},${n.state.y})`
}

function highlightId(result: SearchResult | null, player: TracePlayer): string | null {
  const frame = player.frame
  if (!result) return null
  if (frame.showPath && result.path.length > 0) {
    const n = result.path[Math.min(frame.pathIndex, result.path.length - 1)]
    return stateKey(n.state)
  }
  if (frame.event?.node) return stateKey(frame.event.node.state)
  return null
}

/**
 * Grow exploration tree with playback and FIT every step
 * (preserveView=false → fitToView after each expansion).
 */
function syncTree(
  tree: TreeRenderer,
  result: SearchResult | null,
  player: TracePlayer,
): void {
  if (!result || result.steps.length === 0) return
  const frame = player.frame
  if (frame.showPath) {
    tree.setProgress(result.steps.length - 1, true, false)
  } else {
    tree.setProgress(frame.stepIndex, false, false)
  }
  tree.setHighlight(highlightId(result, player))
}

function redraw(): void {
  const { mapId } = controls.get()
  const maze = MAPS[mapId]
  rendererA.draw(maze, playerA.getResult(), playerA.frame)
  stepA.textContent = `${playerA.frame.stepIndex + 1}/${playerA.length}`
  infoA.textContent = formatNodeInfo(playerA.getResult(), playerA)
  syncTree(treeA, playerA.getResult(), playerA)

  if (controls.get().mode === 'compare') {
    rendererB.draw(maze, playerB.getResult(), playerB.frame)
    stepB.textContent = `${playerB.frame.stepIndex + 1}/${playerB.length}`
    infoB.textContent = formatNodeInfo(playerB.getResult(), playerB)
    syncTree(treeB, playerB.getResult(), playerB)
  }
}

function drawIdle(): void {
  const maze = MAPS[controls.get().mapId]
  rendererA.draw(maze, null, { stepIndex: 0, event: null, showPath: false, pathIndex: 0 })
  rendererB.draw(maze, null, { stepIndex: 0, event: null, showPath: false, pathIndex: 0 })
  treeA.clear()
  treeB.clear()
  stepA.textContent = '—'
  stepB.textContent = '—'
  infoA.textContent = 'Run an algorithm to begin.'
  infoB.textContent = '—'
}

playerA.onChange(() => {
  controls.els.btnPlay.textContent = playerA.isPlaying() || playerB.isPlaying() ? '⏸' : '▶'
  redraw()
})
playerB.onChange(() => {
  controls.els.btnPlay.textContent = playerA.isPlaying() || playerB.isPlaying() ? '⏸' : '▶'
  if (controls.get().mode === 'compare') redraw()
})

function run(): void {
  try {
    const state = controls.get()
    const maze = MAPS[state.mapId]
    if (!maze) {
      insightEl.innerHTML = `<p class="insight-empty">Unknown map: ${state.mapId}</p>`
      return
    }
    playerA.pause()
    playerB.pause()

    if (state.mode === 'single') {
      const result = solve(maze, state.algorithm)
      lastResults = [result]
      titleA.textContent = state.algorithm
      playerA.setResult(result)
      playerB.setResult(null)
      // Full exploration tree in discovery order (not solution-biased)
      treeA.setTree(buildSearchTree(result))
      treeB.clear()
    } else {
      const a = solve(maze, state.algorithmA)
      const b = solve(maze, state.algorithmB)
      lastResults = [a, b]
      titleA.textContent = state.algorithmA
      titleB.textContent = state.algorithmB
      playerA.setResult(a)
      playerB.setResult(b)
      treeA.setTree(buildSearchTree(a))
      treeB.setTree(buildSearchTree(b))
    }

    renderMetrics(metricsEl, lastResults)
    renderInsight(insightEl, lastResults)
    redraw()
    playerA.play()
    if (state.mode === 'compare') playerB.play()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    insightEl.innerHTML = `<p class="insight-empty">Error while running search: ${msg}</p>`
    console.error(err)
  }
}

controls.els.btnRun.addEventListener('click', run)
controls.els.btnPlay.addEventListener('click', () => {
  playerA.toggle()
  if (controls.get().mode === 'compare') {
    if (playerA.isPlaying()) playerB.play()
    else playerB.pause()
  }
})
controls.els.btnReset.addEventListener('click', () => {
  playerA.reset()
  playerB.reset()
})
controls.els.btnStep.addEventListener('click', () => {
  playerA.pause()
  playerB.pause()
  playerA.stepForward()
  if (controls.get().mode === 'compare') playerB.stepForward()
})
controls.els.btnStepBack.addEventListener('click', () => {
  playerA.pause()
  playerB.pause()
  playerA.stepBack()
  if (controls.get().mode === 'compare') playerB.stepBack()
})

updateLayout(controls.get().mode)
renderMetrics(metricsEl, [])
renderInsight(insightEl, [])
drawIdle()

window.addEventListener('resize', () => {
  redraw()
})

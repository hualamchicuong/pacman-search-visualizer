import './style.css'
import { getMap, setCustomMap } from './maps'
import { generateMaze, GenerateError } from './maps/generate'
import { stateKey, type SearchResult } from './core/types'
import { CanvasRenderer } from './viz/canvasRenderer'
import { TracePlayer } from './viz/player'
import { TreeRenderer } from './viz/treeRenderer'
import { buildSearchTree } from './viz/searchTree'
import { bindControls } from './ui/controls'
import { renderInsight, renderMetrics } from './ui/metrics'
import {
  cancelAllSearches,
  SearchCancelledError,
  solveAsync,
  solveCompareAsync,
} from './search/searchClient'

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

canvasA.setAttribute('aria-label', 'Pac-man maze visualization (top / single)')
canvasB.setAttribute('aria-label', 'Pac-man maze visualization (bottom compare)')

const rendererA = CanvasRenderer.attach(canvasA)
const rendererB = CanvasRenderer.attach(canvasB)
const treeA = TreeRenderer.attach(treeViewA, treeCapA)
const treeB = TreeRenderer.attach(treeViewB, treeCapB)
const playerA = new TracePlayer()
const playerB = new TracePlayer()

let lastResults: SearchResult[] = []
let lastMode: 'single' | 'compare' = 'single'

const controls = bindControls((state) => {
  playerA.setSpeed(state.speed)
  playerB.setSpeed(state.speed)
  if (state.mode !== lastMode) {
    playerA.pause()
    playerB.pause()
    if (state.mode === 'single') {
      playerB.setResult(null)
      treeB.clear()
    }
    lastMode = state.mode
  }
  updateLayout(state.mode, state.view)
})

lastMode = controls.get().mode

function clearRun(): void {
  lastResults = []
  playerA.pause()
  playerB.pause()
  playerA.setResult(null)
  playerB.setResult(null)
  treeA.clear()
  treeB.clear()
  titleA.textContent = '—'
  titleB.textContent = '—'
  renderMetrics(metricsEl, [])
  renderInsight(insightEl, [])
  drawIdle()
}

controls.els.mapSelect.addEventListener('change', () => {
  clearRun()
})

function updateLayout(mode: 'single' | 'compare', view: 'both' | 'maze' | 'tree'): void {
  const compare = mode === 'compare'
  panelB.classList.toggle('hidden', !compare)
  panels.classList.toggle('compare', compare)
  panels.classList.toggle('view-maze', view === 'maze')
  panels.classList.toggle('view-tree', view === 'tree')
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
  if (!treeA.hasUserAdjustedView()) treeA.fitToView()
  if (controls.get().mode === 'compare' && !treeB.hasUserAdjustedView()) {
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

function syncTree(
  tree: TreeRenderer,
  result: SearchResult | null,
  player: TracePlayer,
): void {
  if (!result || result.steps.length === 0) return
  const frame = player.frame
  const preserve = tree.hasUserAdjustedView()
  if (frame.showPath) {
    tree.setProgress(result.steps.length - 1, true, preserve)
  } else {
    tree.setProgress(frame.stepIndex, false, preserve)
  }
  tree.setHighlight(highlightId(result, player))
}

function currentMaze() {
  return getMap(controls.get().mapId)
}

function mazeVisible(): boolean {
  return controls.get().view !== 'tree'
}

function redraw(): void {
  const maze = currentMaze()
  if (!maze) return
  const showMaze = mazeVisible()

  if (showMaze) {
    rendererA.draw(maze, playerA.getResult(), playerA.frame)
  }
  stepA.textContent =
    playerA.length > 0 ? `${playerA.frame.stepIndex + 1}/${playerA.length}` : '—'
  infoA.textContent = formatNodeInfo(playerA.getResult(), playerA)
  syncTree(treeA, playerA.getResult(), playerA)

  if (controls.get().mode === 'compare') {
    if (showMaze) {
      rendererB.draw(maze, playerB.getResult(), playerB.frame)
    }
    stepB.textContent =
      playerB.length > 0 ? `${playerB.frame.stepIndex + 1}/${playerB.length}` : '—'
    infoB.textContent = formatNodeInfo(playerB.getResult(), playerB)
    syncTree(treeB, playerB.getResult(), playerB)
  }
}

function drawIdle(): void {
  const maze = currentMaze()
  if (!maze) return
  if (mazeVisible()) {
    rendererA.draw(maze, null, { stepIndex: 0, event: null, showPath: false, pathIndex: 0 })
    if (controls.get().mode === 'compare') {
      rendererB.draw(maze, null, { stepIndex: 0, event: null, showPath: false, pathIndex: 0 })
    }
  }
  treeA.clear()
  treeB.clear()
  stepA.textContent = '—'
  stepB.textContent = '—'
  infoA.textContent = 'Run an algorithm to begin.'
  infoB.textContent = '—'
}

function syncPlayButton(): void {
  controls.els.btnPlay.textContent =
    playerA.isPlaying() || playerB.isPlaying() ? '⏸' : '▶'
}

playerA.onChange(() => {
  syncPlayButton()
  redraw()
})
playerB.onChange(() => {
  syncPlayButton()
  if (controls.get().mode === 'compare') redraw()
})

async function run(): Promise<void> {
  const state = controls.get()
  const maze = getMap(state.mapId)
  if (!maze) {
    insightEl.innerHTML = `<p class="insight-empty">Unknown map: ${state.mapId}</p>`
    return
  }
  playerA.pause()
  playerB.pause()
  controls.setSearchBusy(true, state.mode === 'compare' ? 'Searching (compare)…' : 'Searching…')

  try {
    if (state.mode === 'single') {
      const result = await solveAsync(maze, state.algorithm)
      lastResults = [result]
      titleA.textContent = state.algorithm
      playerA.setResult(result)
      playerB.setResult(null)
      treeA.setTree(buildSearchTree(result))
      treeB.clear()
    } else {
      const [a, b] = await solveCompareAsync(maze, state.algorithmA, state.algorithmB)
      lastResults = [a, b]
      titleA.textContent = state.algorithmA
      titleB.textContent = state.algorithmB
      playerA.setResult(a)
      playerB.setResult(b)
      treeA.setTree(buildSearchTree(a))
      treeB.setTree(buildSearchTree(b))
    }

    renderMetrics(metricsEl, lastResults)
    renderInsight(insightEl, lastResults, maze)
    redraw()
    playerA.play()
    if (state.mode === 'compare') playerB.play()
  } catch (err) {
    if (err instanceof SearchCancelledError) {
      insightEl.innerHTML = `<p class="insight-empty">Search <strong>đã hủy</strong>. Nhấn Run để chạy lại.</p>`
      lastResults = []
      playerA.setResult(null)
      playerB.setResult(null)
      treeA.clear()
      treeB.clear()
      renderMetrics(metricsEl, [])
      drawIdle()
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      insightEl.innerHTML = `<p class="insight-empty">Error while running search: ${msg}</p>`
      console.error(err)
    }
  } finally {
    controls.setSearchBusy(false)
  }
}

controls.els.btnGenerate.addEventListener('click', () => {
  try {
    const form = controls.getGenerate()
    const result = generateMaze({
      size: form.size,
      foodCount: form.foodCount,
      startExits: form.startExits,
      foodsAtCorners: form.foodsAtCorners,
    })
    setCustomMap(result.maze)
    controls.refreshMapSelect('custom')
    const cornerNote = result.foodsAtCorners ? ', foods@4-corners' : ''
    controls.setGenerateStatus(
      `OK — ${form.size}, ${result.maze.foods.length} foods${cornerNote}, start exits=${result.startExits}, open=${result.openCells}. Press Run.`,
      'ok',
    )
    clearRun()
  } catch (err) {
    const msg =
      err instanceof GenerateError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    controls.setGenerateStatus(msg, 'err')
  }
})

controls.els.btnRun.addEventListener('click', () => {
  void run()
})

controls.els.btnCancel.addEventListener('click', () => {
  cancelAllSearches()
  controls.setSearchBusy(true, 'Cancelling…')
})

controls.els.btnFitA.addEventListener('click', () => treeA.fitToView())
controls.els.btnFitB.addEventListener('click', () => treeB.fitToView())

controls.els.btnPlay.addEventListener('click', () => {
  const compare = controls.get().mode === 'compare'
  const anyPlaying = playerA.isPlaying() || (compare && playerB.isPlaying())
  if (anyPlaying) {
    // Global pause — do not toggle/restart a finished panel
    playerA.pause()
    playerB.pause()
  } else {
    if (playerA.getResult()) playerA.play()
    if (compare && playerB.getResult()) playerB.play()
  }
  syncPlayButton()
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

updateLayout(controls.get().mode, controls.get().view)
renderMetrics(metricsEl, [])
renderInsight(insightEl, [])
drawIdle()

window.addEventListener('resize', () => {
  redraw()
})

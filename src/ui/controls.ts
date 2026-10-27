import type { AlgorithmId } from '../core/types'
import { ALGORITHMS } from '../search'
import { listMapIds } from '../maps'
import {
  maxFoodForSize,
  type MapSizeId,
} from '../maps/generate'

export type Mode = 'single' | 'compare'
/** Presenter focus: both panes, maze only, or search tree only */
export type ViewMode = 'both' | 'maze' | 'tree'

export interface ControlState {
  mapId: string
  mode: Mode
  view: ViewMode
  algorithm: AlgorithmId
  algorithmA: AlgorithmId
  algorithmB: AlgorithmId
  speed: number
}

export interface GenerateFormState {
  size: MapSizeId
  foodCount: number
  startExits: 2 | 3 | 4
  foodsAtCorners: boolean
  /** Undefined → random seed */
  seed?: number
}

function fillSelect(el: HTMLSelectElement, values: string[], selected?: string): void {
  const prev = selected ?? el.value
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join('')
  if (prev && values.includes(prev)) el.value = prev
  else if (selected) el.value = selected
}

export function bindControls(onChange?: (s: ControlState) => void): {
  get: () => ControlState
  getGenerate: () => GenerateFormState
  refreshMapSelect: (selectId?: string) => void
  setGenerateHint: (text: string) => void
  setGenerateStatus: (text: string, kind: 'ok' | 'err' | 'clear') => void
  setSearchBusy: (busy: boolean, status?: string) => void
  els: {
    mapSelect: HTMLSelectElement
    modeSelect: HTMLSelectElement
    viewSelect: HTMLSelectElement
    algoSelect: HTMLSelectElement
    algoASelect: HTMLSelectElement
    algoBSelect: HTMLSelectElement
    speedRange: HTMLInputElement
    btnRun: HTMLButtonElement
    btnCancel: HTMLButtonElement
    btnPlay: HTMLButtonElement
    btnReset: HTMLButtonElement
    btnStep: HTMLButtonElement
    btnStepBack: HTMLButtonElement
    btnGenerate: HTMLButtonElement
    btnFitA: HTMLButtonElement
    btnFitB: HTMLButtonElement
    genSize: HTMLSelectElement
    genFoods: HTMLInputElement
    genCorners: HTMLInputElement
    genExits: HTMLSelectElement
    genSeed: HTMLInputElement
    genHint: HTMLElement
    genStatus: HTMLElement
    runStatus: HTMLElement
    algoField: HTMLElement
    compareFields: HTMLElement[]
  }
} {
  const mapSelect = document.querySelector('#map-select') as HTMLSelectElement
  const modeSelect = document.querySelector('#mode-select') as HTMLSelectElement
  const viewSelect = document.querySelector('#view-select') as HTMLSelectElement
  const algoSelect = document.querySelector('#algo-select') as HTMLSelectElement
  const algoASelect = document.querySelector('#algo-a-select') as HTMLSelectElement
  const algoBSelect = document.querySelector('#algo-b-select') as HTMLSelectElement
  const speedRange = document.querySelector('#speed-range') as HTMLInputElement
  const btnRun = document.querySelector('#btn-run') as HTMLButtonElement
  const btnCancel = document.querySelector('#btn-cancel') as HTMLButtonElement
  const btnPlay = document.querySelector('#btn-play') as HTMLButtonElement
  const btnReset = document.querySelector('#btn-reset') as HTMLButtonElement
  const btnStep = document.querySelector('#btn-step') as HTMLButtonElement
  const btnStepBack = document.querySelector('#btn-step-back') as HTMLButtonElement
  const btnGenerate = document.querySelector('#btn-generate') as HTMLButtonElement
  const btnFitA = document.querySelector('#btn-fit-a') as HTMLButtonElement
  const btnFitB = document.querySelector('#btn-fit-b') as HTMLButtonElement
  const genSize = document.querySelector('#gen-size') as HTMLSelectElement
  const genFoods = document.querySelector('#gen-foods') as HTMLInputElement
  const genCorners = document.querySelector('#gen-corners') as HTMLInputElement
  const genExits = document.querySelector('#gen-exits') as HTMLSelectElement
  const genSeed = document.querySelector('#gen-seed') as HTMLInputElement
  const genHint = document.querySelector('#gen-hint') as HTMLElement
  const genStatus = document.querySelector('#gen-status') as HTMLElement
  const runStatus = document.querySelector('#run-status') as HTMLElement
  const algoField = document.querySelector('#algo-field') as HTMLElement
  const compareFields = [
    document.querySelector('#algo-a-field') as HTMLElement,
    document.querySelector('#algo-b-field') as HTMLElement,
  ]

  fillSelect(mapSelect, listMapIds(), 'branchy')
  fillSelect(algoSelect, ALGORITHMS, 'BFS')
  fillSelect(algoASelect, ALGORITHMS, 'BFS')
  fillSelect(algoBSelect, ALGORITHMS, 'A*')

  const get = (): ControlState => ({
    mapId: mapSelect.value,
    mode: modeSelect.value as Mode,
    view: viewSelect.value as ViewMode,
    algorithm: algoSelect.value as AlgorithmId,
    algorithmA: algoASelect.value as AlgorithmId,
    algorithmB: algoBSelect.value as AlgorithmId,
    speed: Number(speedRange.value),
  })

  const getGenerate = (): GenerateFormState => {
    const raw = genSeed.value.trim()
    const parsed = raw === '' ? NaN : Number(raw)
    return {
      size: genSize.value as MapSizeId,
      foodCount: genCorners.checked ? 4 : Number(genFoods.value),
      startExits: Number(genExits.value) as 2 | 3 | 4,
      foodsAtCorners: genCorners.checked,
      seed: Number.isFinite(parsed) ? Math.trunc(parsed) : undefined,
    }
  }

  const setSearchBusy = (busy: boolean, status?: string): void => {
    btnRun.disabled = busy
    btnGenerate.disabled = busy
    mapSelect.disabled = busy
    modeSelect.disabled = busy
    algoSelect.disabled = busy
    algoASelect.disabled = busy
    algoBSelect.disabled = busy
    btnCancel.classList.toggle('hidden', !busy)
    if (busy) {
      runStatus.hidden = false
      runStatus.textContent = status ?? 'Searching…'
    } else {
      runStatus.hidden = true
      runStatus.textContent = ''
    }
  }

  const setGenerateHint = (text: string): void => {
    genHint.textContent = text
  }

  const setGenerateStatus = (text: string, kind: 'ok' | 'err' | 'clear'): void => {
    if (kind === 'clear') {
      genStatus.hidden = true
      genStatus.textContent = ''
      genStatus.classList.remove('ok', 'err')
      return
    }
    genStatus.hidden = false
    genStatus.textContent = text
    genStatus.classList.toggle('ok', kind === 'ok')
    genStatus.classList.toggle('err', kind === 'err')
  }

  const syncFoodLimits = (): void => {
    const size = genSize.value as MapSizeId
    const max = maxFoodForSize(size)
    const corners = genCorners.checked
    genFoods.disabled = corners
    if (corners) {
      genFoods.value = '4'
      setGenerateHint(
        `4-corner mode: luôn đúng 4 food ở 4 góc (ô cạnh góc tường). Input Foods bị khóa — edge case thứ tự ăn / Greedy.`,
      )
      return
    }
    genFoods.max = String(max)
    if (Number(genFoods.value) > max) genFoods.value = String(max)
    if (Number(genFoods.value) < 1) genFoods.value = '1'
    setGenerateHint(
      `Max foods for ${size}: ${max} (geometric upper bound ≤ open−1, cap 20). Dense walls may make high counts fail — try fewer foods.`,
    )
  }

  const refreshMapSelect = (selectId?: string): void => {
    fillSelect(mapSelect, listMapIds(), selectId ?? mapSelect.value)
  }

  const syncMode = (notify: boolean): void => {
    const compare = modeSelect.value === 'compare'
    algoField.classList.toggle('hidden', compare)
    for (const f of compareFields) f.classList.toggle('hidden', !compare)
    if (notify) onChange?.(get())
  }

  modeSelect.addEventListener('change', () => syncMode(true))
  viewSelect.addEventListener('change', () => onChange?.(get()))
  for (const el of [mapSelect, algoSelect, algoASelect, algoBSelect, speedRange]) {
    el.addEventListener('change', () => onChange?.(get()))
    el.addEventListener('input', () => onChange?.(get()))
  }

  genSize.addEventListener('change', () => {
    syncFoodLimits()
    setGenerateStatus('', 'clear')
  })
  genFoods.addEventListener('input', () => {
    syncFoodLimits()
    setGenerateStatus('', 'clear')
  })
  genCorners.addEventListener('change', () => {
    syncFoodLimits()
    setGenerateStatus('', 'clear')
  })
  genExits.addEventListener('change', () => setGenerateStatus('', 'clear'))

  syncFoodLimits()
  syncMode(false)

  return {
    get,
    getGenerate,
    refreshMapSelect,
    setGenerateHint,
    setGenerateStatus,
    setSearchBusy,
    els: {
      mapSelect,
      modeSelect,
      viewSelect,
      algoSelect,
      algoASelect,
      algoBSelect,
      speedRange,
      btnRun,
      btnCancel,
      btnPlay,
      btnReset,
      btnStep,
      btnStepBack,
      btnGenerate,
      btnFitA,
      btnFitB,
      genSize,
      genFoods,
      genCorners,
      genExits,
      genSeed,
      genHint,
      genStatus,
      runStatus,
      algoField,
      compareFields,
    },
  }
}

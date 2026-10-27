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
  els: {
    mapSelect: HTMLSelectElement
    modeSelect: HTMLSelectElement
    viewSelect: HTMLSelectElement
    algoSelect: HTMLSelectElement
    algoASelect: HTMLSelectElement
    algoBSelect: HTMLSelectElement
    speedRange: HTMLInputElement
    btnRun: HTMLButtonElement
    btnPlay: HTMLButtonElement
    btnReset: HTMLButtonElement
    btnStep: HTMLButtonElement
    btnStepBack: HTMLButtonElement
    btnGenerate: HTMLButtonElement
    genSize: HTMLSelectElement
    genFoods: HTMLInputElement
    genCorners: HTMLInputElement
    genExits: HTMLSelectElement
    genHint: HTMLElement
    genStatus: HTMLElement
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
  const btnPlay = document.querySelector('#btn-play') as HTMLButtonElement
  const btnReset = document.querySelector('#btn-reset') as HTMLButtonElement
  const btnStep = document.querySelector('#btn-step') as HTMLButtonElement
  const btnStepBack = document.querySelector('#btn-step-back') as HTMLButtonElement
  const btnGenerate = document.querySelector('#btn-generate') as HTMLButtonElement
  const genSize = document.querySelector('#gen-size') as HTMLSelectElement
  const genFoods = document.querySelector('#gen-foods') as HTMLInputElement
  const genCorners = document.querySelector('#gen-corners') as HTMLInputElement
  const genExits = document.querySelector('#gen-exits') as HTMLSelectElement
  const genHint = document.querySelector('#gen-hint') as HTMLElement
  const genStatus = document.querySelector('#gen-status') as HTMLElement
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

  const getGenerate = (): GenerateFormState => ({
    size: genSize.value as MapSizeId,
    foodCount: genCorners.checked ? 4 : Number(genFoods.value),
    startExits: Number(genExits.value) as 2 | 3 | 4,
    foodsAtCorners: genCorners.checked,
  })

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
    els: {
      mapSelect,
      modeSelect,
      viewSelect,
      algoSelect,
      algoASelect,
      algoBSelect,
      speedRange,
      btnRun,
      btnPlay,
      btnReset,
      btnStep,
      btnStepBack,
      btnGenerate,
      genSize,
      genFoods,
      genCorners,
      genExits,
      genHint,
      genStatus,
      algoField,
      compareFields,
    },
  }
}

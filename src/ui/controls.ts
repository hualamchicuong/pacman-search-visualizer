import type { AlgorithmId } from '../core/types'
import { ALGORITHMS } from '../search'
import { MAP_IDS } from '../maps'

export type Mode = 'single' | 'compare'

export interface ControlState {
  mapId: string
  mode: Mode
  algorithm: AlgorithmId
  algorithmA: AlgorithmId
  algorithmB: AlgorithmId
  speed: number
}

function fillSelect(el: HTMLSelectElement, values: string[], selected?: string): void {
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join('')
  if (selected) el.value = selected
}

export function bindControls(onChange?: (s: ControlState) => void): {
  get: () => ControlState
  els: {
    mapSelect: HTMLSelectElement
    modeSelect: HTMLSelectElement
    algoSelect: HTMLSelectElement
    algoASelect: HTMLSelectElement
    algoBSelect: HTMLSelectElement
    speedRange: HTMLInputElement
    btnRun: HTMLButtonElement
    btnPlay: HTMLButtonElement
    btnReset: HTMLButtonElement
    btnStep: HTMLButtonElement
    btnStepBack: HTMLButtonElement
    algoField: HTMLElement
    compareFields: HTMLElement[]
  }
} {
  const mapSelect = document.querySelector('#map-select') as HTMLSelectElement
  const modeSelect = document.querySelector('#mode-select') as HTMLSelectElement
  const algoSelect = document.querySelector('#algo-select') as HTMLSelectElement
  const algoASelect = document.querySelector('#algo-a-select') as HTMLSelectElement
  const algoBSelect = document.querySelector('#algo-b-select') as HTMLSelectElement
  const speedRange = document.querySelector('#speed-range') as HTMLInputElement
  const btnRun = document.querySelector('#btn-run') as HTMLButtonElement
  const btnPlay = document.querySelector('#btn-play') as HTMLButtonElement
  const btnReset = document.querySelector('#btn-reset') as HTMLButtonElement
  const btnStep = document.querySelector('#btn-step') as HTMLButtonElement
  const btnStepBack = document.querySelector('#btn-step-back') as HTMLButtonElement
  const algoField = document.querySelector('#algo-field') as HTMLElement
  const compareFields = [
    document.querySelector('#algo-a-field') as HTMLElement,
    document.querySelector('#algo-b-field') as HTMLElement,
  ]

  fillSelect(mapSelect, MAP_IDS, 'tiny')
  fillSelect(algoSelect, ALGORITHMS, 'BFS')
  fillSelect(algoASelect, ALGORITHMS, 'BFS')
  fillSelect(algoBSelect, ALGORITHMS, 'A*')

  const get = (): ControlState => ({
    mapId: mapSelect.value,
    mode: modeSelect.value as Mode,
    algorithm: algoSelect.value as AlgorithmId,
    algorithmA: algoASelect.value as AlgorithmId,
    algorithmB: algoBSelect.value as AlgorithmId,
    speed: Number(speedRange.value),
  })

  const syncMode = (notify: boolean): void => {
    const compare = modeSelect.value === 'compare'
    algoField.classList.toggle('hidden', compare)
    for (const f of compareFields) f.classList.toggle('hidden', !compare)
    // Do not notify during initial bind — caller may still be initializing
    if (notify) onChange?.(get())
  }

  modeSelect.addEventListener('change', () => syncMode(true))
  for (const el of [mapSelect, algoSelect, algoASelect, algoBSelect, speedRange]) {
    el.addEventListener('change', () => onChange?.(get()))
    el.addEventListener('input', () => onChange?.(get()))
  }

  syncMode(false)

  return {
    get,
    els: {
      mapSelect,
      modeSelect,
      algoSelect,
      algoASelect,
      algoBSelect,
      speedRange,
      btnRun,
      btnPlay,
      btnReset,
      btnStep,
      btnStepBack,
      algoField,
      compareFields,
    },
  }
}

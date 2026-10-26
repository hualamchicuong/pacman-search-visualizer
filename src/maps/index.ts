import { parseMaze, type Maze } from '../core/maze'

const TINY = [
  '#######',
  '#P...o#',
  '#.###.#',
  '#o...o#',
  '#######',
]

const SMALL = [
  '###########',
  '#P....#..o#',
  '#.###.#.#.#',
  '#o..#...#.#',
  '###.#.###.#',
  '#o.......o#',
  '###########',
]

const MEDIUM = [
  '###############',
  '#P..o....#...o#',
  '#.#####.#.###.#',
  '#o....#.#.....#',
  '###.#.#.#####.#',
  '#...#o......#o#',
  '#.#######.#.#.#',
  '#o........#..o#',
  '###############',
]

/** Pac-man at a 4-way junction (shows start can have >2 exits). */
const BRANCHY = [
  '###############',
  '#o...........o#',
  '#.#####.#####.#',
  '#.............#',
  '#.###.P.###.#.#',
  '#.............#',
  '#.#####.#####.#',
  '#o...........o#',
  '###############',
]

const BUILTIN: Record<string, Maze> = {
  tiny: parseMaze('tiny', TINY),
  small: parseMaze('small', SMALL),
  medium: parseMaze('medium', MEDIUM),
  branchy: parseMaze('branchy', BRANCHY),
}

let customMaze: Maze | null = null

/** Live map table (includes `custom` after generate). */
export const MAPS: Record<string, Maze> = { ...BUILTIN }

export function getMap(id: string): Maze | undefined {
  if (id === 'custom') return customMaze ?? undefined
  return BUILTIN[id]
}

export function setCustomMap(maze: Maze): void {
  customMaze = { ...maze, name: 'custom' }
  MAPS.custom = customMaze
}

export function hasCustomMap(): boolean {
  return customMaze !== null
}

export function listMapIds(): string[] {
  const ids = [...Object.keys(BUILTIN)]
  if (customMaze) ids.push('custom')
  return ids
}

/** Built-in ids only (dropdown seed). Prefer listMapIds() after generate. */
export const MAP_IDS = Object.keys(BUILTIN)

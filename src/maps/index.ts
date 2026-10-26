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

export const MAPS: Record<string, Maze> = {
  tiny: parseMaze('tiny', TINY),
  small: parseMaze('small', SMALL),
  medium: parseMaze('medium', MEDIUM),
}

export const MAP_IDS = Object.keys(MAPS)

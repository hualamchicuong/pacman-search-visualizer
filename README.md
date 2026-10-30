# Pac-man Search Visualizer

Client-side web app that visualizes **uninformed** (BFS, DFS, UCS) and **informed** (Greedy, A*) search on a multi-food Pac-man maze.

State: `(x, y, foodBitmask)`. No backend — solvers run in the browser (Web Worker).

## Live site (GitHub Pages)

After enabling **Settings → Pages → GitHub Actions**:

**https://hualamchicuong.github.io/pacman-search-visualizer/**

## Local setup

Requires Node.js 18+.

```bash
npm install
npm run dev
```

### Verify / tests

```bash
npm run verify      # algorithm correctness + heuristic consistency
npm run test:edge  # edge cases, generator, tree inject
npm run build
```

## Features

- **Maps:** `tiny`, `small`, `medium`, `branchy`, plus **Generate** (size, food count, start exits 2–4, foods at 4 corners, optional seed)
- **Mode:** Single / Compare (Top / Bottom panels)
- **View:** Both | Pac-man only | Tree only
- Step-through animation of OPEN / CLOSED / solution path
- Growing search tree by expansion order (expanded nodes only)
- Metrics (`ms` = pure search time) + structured Insight (VI)
- Theory write-up: [docs/state-space.md](docs/state-space.md)

## Project layout

| Area | Role |
|:---|:---|
| `src/core/` | Maze parser, successors / goal / cost, shared types |
| `src/search/` | Engine (BFS/DFS/UCS/Greedy/A*), heuristic, worker + client |
| `src/maps/` | Built-in maps + `generate.ts` |
| `src/viz/` | Canvas maze, SVG search tree, TracePlayer |
| `src/ui/` | Controls, metrics, Insight |
| `scripts/` | `verify-algorithms.ts`, `edge-cases.ts`, `smoke.ts` |
| `docs/` | Theory report + code-review prompt |

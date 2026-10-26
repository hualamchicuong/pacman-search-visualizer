# Pac-man Search Visualizer

Client-side web app that visualizes **uninformed** (BFS, DFS, UCS) and **informed** (Greedy, A*) search on a multi-food Pac-man maze.

State: `(x, y, foodBitmask)`. No backend — solvers run in the browser.

## Live site (GitHub Pages)

After enabling **Settings → Pages → GitHub Actions**:

**https://hualamchicuong.github.io/pacman-search-visualizer/**

## Local setup

Requires Node.js 18+.

```bash
npm install
npm run dev
```

## Features

- Single / Compare modes
- Step-through animation of OPEN / CLOSED / solution path
- Growing search tree by expansion order
- Metrics + insight panel
- Theory write-up: [docs/state-space.md](docs/state-space.md)

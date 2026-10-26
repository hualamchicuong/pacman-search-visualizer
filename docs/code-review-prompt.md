# Code review: Pac-man State-Space Search Visualizer

Bạn là senior engineer + AI course TA. Review toàn bộ project web client-only (Vite + TypeScript + Canvas/SVG), không backend.

## Bối cảnh bài tập

- Phân tích không gian trạng thái Pac-man ăn nhiều food.
- Biểu diễn state: `(x, y, foodMask)` — vị trí + bitmask food còn lại.
- Goal: `foodMask === 0`.
- So sánh uninformed vs informed search; nêu ưu/nhược điểm.
- App visualizer: chạy thuật toán, playback từng bước, vẽ maze + search tree, mode Single/Compare, metrics + insight.

## Stack & cấu trúc chính

- Repo: `pacman-search-visualizer` (GitHub Pages).
- `src/core/` — maze parser, problem (successors, goal, cost).
- `src/search/` — engine chung cho BFS/DFS/UCS/Greedy/A*; `heuristic.ts`.
- `src/viz/` — canvas maze, search tree (SVG), playback player.
- `src/ui/` — controls, metrics, insight.
- `src/main.ts`, `index.html`, `src/style.css`.
- Docs: `docs/state-space.md`. Scripts: `scripts/verify-algorithms.ts`.

## Phạm vi review (bắt buộc đủ các mục)

### 1. Thuật toán & độ đúng

- BFS / DFS / UCS / Greedy / A* có đúng semantics không (OPEN/CLOSED, tie-break, khi nào expand, goal test lúc generate hay expand)?
- Cost bước có đều = 1 không? UCS vs BFS trên unit cost có nhất quán không?
- Heuristic: nearest Manhattan + MST trên food còn lại — có admissible không? Có consistent không? Hệ quả với A* (optimal khi nào)?
- `stateKey` / closed set có đủ để tránh revisit sai state không?
- Metrics (`nodesExpanded`, `nodesGenerated`, `pathCost`, `complete`/`optimal` flags) có phản ánh đúng lý thuyết không?
- Edge cases: 0 food, map không reachable, DFS path dài, compare mode.

### 2. Mô hình state-space

- Bitmask food có đúng indexing với maze không?
- Successors / ăn food / wall collision.
- State space size ước lượng vs docs — docs có khớp code không?

### 3. Visualization & playback

- Trace/`StepEvent` có đủ để animate OPEN/CLOSED/path không? Có lệch so với search thật không?
- Search tree: build theo exploration order, layout, fit/pan/zoom — có gây hiểu nhầm thuật toán không? Cách vẽ cây đã đúng với logic của thuật toán hay chưa?
- Smooth Pac-man/food trên canvas — timing với step có sync không?
- Compare mode (2 panel xếp dọc) — state player có conflict không?

### 4. UI/UX & giao diện

- Layout: toolbar trái, stage (maze+tree), metrics dưới maze, legend/insight phải.
- Hierarchy, readability dark theme, spacing, overflow/scroll metrics table.
- Controls/playback (Run, step, speed) — affordance, disabled states, empty state.
- Mobile/responsive breakpoints.
- Accessibility cơ bản (labels, contrast, SVG logo).
- Copy Insight tiếng Việt: có chính xác / overclaim không?

### 5. Code quality

- TypeScript types, tách module, trùng lặp.
- Performance (tree re-layout mỗi step, canvas redraw).
- Bugs tiềm ẩn, dead code, magic numbers.
- Deploy: `VITE_BASE` / GitHub Pages có risk path asset không?

## Cách trả lời (format bắt buộc)

1. **Verdict tổng** (1 đoạn): sẵn sàng nộp bài / cần sửa gì trước.
2. **Findings** theo mức:
   - 🔴 Critical (sai thuật toán / bug chạy sai)
   - 🟠 Major (UX/perf/docs lệch nghiêm trọng)
   - 🟡 Minor (polish, naming, a11y)
3. Mỗi finding: file/hàm gợi ý + vì sao + hướng sửa ngắn (không viết lại cả project).
4. **Checklist lý thuyết** bảng: thuật toán × (complete / optimal / notes) — đối chiếu `ALGORITHM_META` và behavior thật.
5. **Điểm mạnh** (3–5 ý) để giữ nguyên.
6. **Ưu tiên sửa** top 5 nếu thời gian có hạn.

## Ràng buộc

- Review dựa trên code thật trong repo, không bịa API.
- Phân biệt “bug thuật toán” vs “giới hạn visualization”.
- Không rewrite toàn bộ; ưu tiên phát hiện lỗi và đề xuất cụ thể.
- Trả lời bằng tiếng Việt, thuật ngữ kỹ thuật giữ English khi chuẩn (OPEN, admissible, …).

## Gợi ý đọc file (khi context hạn chế)

Ưu tiên đọc trước: `src/search/engine.ts`, `src/search/heuristic.ts`, `src/core/problem.ts`, `src/viz/searchTree.ts`, `src/main.ts`, `src/ui/metrics.ts`, `docs/state-space.md`.

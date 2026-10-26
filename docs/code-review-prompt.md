# Code review: Pac-man State-Space Search Visualizer

Bạn là senior engineer + AI course TA. Review toàn bộ project web client-only (Vite + TypeScript + Canvas/SVG), không backend.

Repo: https://github.com/hualamchicuong/pacman-search-visualizer  
Live (GitHub Pages): https://hualamchicuong.github.io/pacman-search-visualizer/

## Bối cảnh bài tập

- Phân tích không gian trạng thái Pac-man ăn **nhiều food**.
- Biểu diễn state: `(x, y, foodMask)` — vị trí + bitmask food còn lại.
- Goal: `foodMask === 0` (vị trí cuối bất kỳ sau khi hết food).
- Chi phí bước: `c = 1` mọi action hợp lệ.
- So sánh uninformed (BFS/DFS/UCS) vs informed (Greedy/A*); nêu ưu/nhược điểm.
- App visualizer: chạy thuật toán, playback từng bước, vẽ maze + search tree, metrics + insight.

## Stack & cấu trúc chính

| Khu vực | Vai trò |
|:---|:---|
| `src/core/` | `maze.ts` parser; `problem.ts` successors/goal/cost; `types.ts` |
| `src/search/` | Engine chung BFS/DFS/UCS/Greedy/A*; `heuristic.ts` (nearest Manhattan + MST) |
| `src/maps/` | Map built-in (`tiny`/`small`/`medium`/`branchy`); `generate.ts` gen map tùy chọn |
| `src/viz/` | Canvas maze, search tree SVG (pan/zoom/fit), `TracePlayer` |
| `src/ui/` | Controls, metrics table, structured Insight (VI) |
| `src/main.ts`, `index.html`, `src/style.css` | Wiring + layout |
| `docs/state-space.md` | Báo cáo lý thuyết |
| `docs/code-review-prompt.md` | Prompt này |
| `scripts/verify-algorithms.ts` | Smoke đúng thuật toán |
| `.github/workflows/deploy-pages.yml` | Deploy Pages với `VITE_BASE=/pacman-search-visualizer/` |

## Tính năng UI hiện có (phải review đúng với bản này)

- **Mode**: Single / Compare (2 panel **xếp dọc** Top/Bottom — không còn Left/Right).
- **View** (presenter): `Both` | `Pac-man only` | `Tree only` — ẩn một pane, giữ toolbar/metrics/legend/insight.
- **Maps**: `tiny`, `small`, `medium`, `branchy` (Pac-man ở ngã 4), `custom` sau Generate.
- **Generate map**:
  - Size giữ footprint tiny/small/medium.
  - Số foods (validate ≤ open cells − 1, hard cap 20 bitmask).
  - Start exits: 2 / 3 / 4 (Pac-man **không** luôn chỉ có 2 lối — map góc cũ mới degree=2).
  - Checkbox **Foods at 4 corners** → luôn 4 food ở 4 ô góc trong; **disable** input số foods.
- **Playback**: reset / step back / play-pause / step / speed.
- **Metrics** nằm **dưới** maze+tree; Legend + Insight cột phải.
- **Legend**: Pac-man = SVG miệng mở (không nhầm Food); phân biệt Maze path vs Tree path / goal / explored node.
- **Insight**: HTML có cấu trúc; verdict in đậm; khi map food 4 góc → gợi ý đổi (Greedy edge case thứ tự ăn / TSP-like).

## Phạm vi review (bắt buộc đủ các mục)

### 1. Thuật toán & độ đúng

- BFS / DFS / UCS / Greedy / A*: semantics OPEN/CLOSED, tie-break, goal-test (generate vs expand).
- Unit cost: UCS vs BFS có nhất quán không?
- Heuristic `nearest + MST(foods)`: admissible? consistent? A* optimal khi nào?
- `stateKey(x,y,foodMask)` / closed / best-g: tránh revisit sai.
- Metrics (`nodesExpanded`, `nodesGenerated`, `pathCost`, flags complete/optimal trong `ALGORITHM_META`) khớp lý thuyết + hành vi thật.
- Edge cases: 0 food, unreachable, DFS path dài, compare 2 algo, **food 4 góc** (thứ tự ăn), start degree 3–4, map `custom` gen.

### 2. Mô hình state-space

- Bitmask indexing vs `maze.foods`.
- Successors / ăn food / tường.
- Ước lượng `|S| ≤ N_passable × 2^k` — docs (`state-space.md`) còn khớp code/maps mới (`branchy`, generate, corners) không? Docs có outdated không?

### 3. Map generator

- `generateMaze`: connectivity, start exits đúng 2–4, foods reachable.
- `foodsAtCorners`: đúng 4 slot góc; start không đè food góc; validate/disable UI nhất quán.
- Fail messages / retry có hợp lý không? Seed reproducibility?

### 4. Visualization & playback

- `StepEvent` / trace sync với search thật (OPEN/CLOSED/path).
- Search tree theo **exploration order** (không bias path khi đang explore); tô path sau khi tìm thấy — có gây hiểu nhầm không?
- Fit mỗi step, pan/zoom; Compare 2 player có conflict không?
- Canvas Pac-man/food smooth; timing với playback.
- View maze-only / tree-only: reflow + redraw/fit có ổn không?

### 5. UI/UX & Insight

- Layout: toolbar | stage | side; metrics dưới; dark theme hierarchy.
- Labels Compare Top/Bottom; View modes; Generate panel UX (disabled foods khi corners).
- Insight tiếng Việt: đúng lý thuyết? Overclaim? Có cover edge case 4 góc / multi-food khi maze tương ứng?
- Legend màu/icon khớp `canvasRenderer` + `treeRenderer`.
- Responsive / a11y cơ bản (logo SVG, contrast, labels).

### 6. Code quality & deploy

- TS modules, trùng lặp, dead code.
- Perf: tree layout mỗi step, canvas HiDPI.
- Pages: `VITE_BASE`, workflow artifact path, asset 404 risk.

## Cách trả lời (format bắt buộc)

1. **Verdict tổng** (1 đoạn): sẵn sàng nộp / cần sửa gì trước.
2. **Findings** theo mức:
   - 🔴 Critical (sai thuật toán / bug chạy sai)
   - 🟠 Major (UX/perf/docs lệch nghiêm trọng, generator sai constraint)
   - 🟡 Minor (polish, naming, a11y, copy Insight)
3. Mỗi finding: file/hàm + vì sao + hướng sửa ngắn (không rewrite cả project).
4. **Checklist lý thuyết** bảng: Algo × (complete / optimal / notes) — đối chiếu `ALGORITHM_META` và behavior; thêm cột ghi chú riêng cho **food 4 góc** nếu có.
5. **Điểm mạnh** (3–5 ý) giữ nguyên.
6. **Ưu tiên sửa** top 5 nếu thời gian có hạn.
7. (Tuỳ chọn) Checklist thủ công 5 bước present: Single + Compare + View maze/tree + Generate corners + Insight.

## Ràng buộc

- Review dựa trên code thật trong repo, không bịa API.
- Phân biệt “bug thuật toán” vs “giới hạn / lựa chọn visualization”.
- Không rewrite toàn bộ; ưu tiên lỗi và đề xuất cụ thể.
- Trả lời bằng **tiếng Việt**; thuật ngữ chuẩn giữ English (OPEN, admissible, MST, frontier, …).

## Gợi ý đọc file (khi context hạn chế)

**Ưu tiên:**  
`src/search/engine.ts`, `src/search/heuristic.ts`, `src/core/problem.ts`, `src/core/maze.ts`, `src/maps/generate.ts`, `src/maps/index.ts`, `src/viz/searchTree.ts`, `src/viz/treeRenderer.ts`, `src/viz/canvasRenderer.ts`, `src/ui/metrics.ts`, `src/ui/controls.ts`, `src/main.ts`, `docs/state-space.md`, `index.html`.

**Nhanh:** chạy `scripts/verify-algorithms.ts` nếu môi trường cho phép; gen map corners rồi Compare BFS vs Greedy để kiểm Insight.

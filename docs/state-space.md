# Phân tích Không gian Trạng thái — Bài toán Pac-man (Search)

*(Báo cáo kèm ứng dụng `pacman-search-visualizer` — Vite + TypeScript, chạy thuật toán trên client)*

Cấu trúc theo rubric 5 phần: Tóm tắt → State-space → Operators → Thuật toán & heuristic → Trace / thực nghiệm.

---

## 1. Tóm tắt đề bài & Ký hiệu

- **Môi trường:** mê cung lưới 2D tĩnh (không ghost).
- **Tác tử:** Pac-man di chuyển 4 hướng.
- **Mục tiêu:** ăn **hết** mọi viên thức ăn với số bước tối thiểu (khi dùng thuật toán tối ưu).
- **Ký hiệu ô:** `#` tường, `.` hành lang, `P` vị trí bắt đầu, `o` thức ăn, `F` = start+food (food bị ăn ngay ở \(S_0\)).
- **Chi phí bước:** \(c(S, a, S') = 1\) với mọi hành động hợp lệ.

Ứng dụng cung cấp map mẫu: `tiny` (3 food), `small` (4 food), `medium` (7 food), `branchy` (4 food ở góc / ngã tư), cùng **Generate** (custom: số food, start exits 2–4, tùy chọn food 4 góc, seed tái tạo được).

---

## 2. Biểu diễn Không gian Trạng thái

### 2.1 Biểu diễn trạng thái \(S\)

$$
S = (x, y, F)
$$

- \(x, y\): tọa độ Pac-man trên lưới (\(0 \le x < W\), \(0 \le y < H\)).
- \(F\): **bitmask** các food còn lại. Food thứ \(i\) còn tồn tại ⟺ bit \(i\) của \(F\) bằng 1.
- Ràng buộc: không đứng trên tường; \(F\) chỉ chứa các food thuộc map.

**Kích thước không gian (cận trên):**

$$
|S| \le N_{\text{passable}} \times 2^{k}
$$

với \(k\) = số food, \(N_{\text{passable}}\) = số ô không phải tường. Không phải mọi tổ hợp \((x,y,F)\) đều reachable.

| Map | \(N_{\text{passable}}\) | \(k\) | Cận trên \(|S|\) | Reachable (đếm từ \(S_0\)) |
|:---|---:|---:|---:|---:|
| tiny | 12 | 3 | 96 | 66 |
| small | 31 | 4 | 496 | 452 |
| medium | 58 | 7 | 7424 | 2111 |
| branchy | 64 | 4 | 1024 | 992 |

### 2.2 Trạng thái đầu \(S_0\)

$$
S_0 = (x_P, y_P, F_0)
$$

\(F_0\) = full mask, trừ bit food tại ô start nếu layout dùng `F`.

Ví dụ map `tiny`: \(S_0 = (1, 1, 111_2)\) (3 food còn lại).

### 2.3 Trạng thái đích \(S_G\)

$$
S_G = \{ (x, y, F) \mid F = 0 \}
$$

Vị trí \((x,y)\) bất kỳ sau khi hết food đều là goal. Map 0 food → goal ngay tại root (cost 0).

---

## 3. Toán tử / Actions

Từ \(S = (x, y, F)\), bốn toán tử cardinal. Ký hiệu \(wall(x',y')\) = ô \((x',y')\) là tường hoặc ngoài biên.

### 3.1 `Up`

- **Precondition:** \(y > 0\) và \(\neg wall(x, y-1)\).
- **Transition:** \((x, y, F) \xrightarrow{\text{Up}} (x, y-1, F')\), với
  $$
  F' = \begin{cases}
  F \mathbin{\&} \neg(1 \ll i) & \text{nếu ô }(x,y-1)\text{ chứa food }i\text{ còn trong }F \\
  F & \text{ngược lại}
  \end{cases}
  $$

### 3.2 `Down`

- **Precondition:** \(y < H-1\) và \(\neg wall(x, y+1)\).
- **Transition:** \((x, y, F) \xrightarrow{\text{Down}} (x, y+1, F')\) (cùng quy tắc \(F'\) như trên tại ô mới).

### 3.3 `Left`

- **Precondition:** \(x > 0\) và \(\neg wall(x-1, y)\).
- **Transition:** \((x, y, F) \xrightarrow{\text{Left}} (x-1, y, F')\).

### 3.4 `Right`

- **Precondition:** \(x < W-1\) và \(\neg wall(x+1, y)\).
- **Transition:** \((x, y, F) \xrightarrow{\text{Right}} (x+1, y, F')\).

**Path cost:** \(c(S, a, S') = 1\) cho mọi action hợp lệ. Branching factor \(b \le 4\).

---

## 4. Lựa chọn & Biện luận Giải thuật

### 4.1 Cơ chế OPEN / CLOSED (graph search)

Ứng dụng dùng **một engine** chung; khác nhau ở cấu trúc OPEN và có/không heuristic:

```
OPEN ← [S₀];  bestG[S₀] ← 0;  CLOSED ← ∅
while OPEN ≠ ∅:
  N ← pop(OPEN)                    # theo chiến lược thuật toán
  if N.g > bestG[N.state]: continue  # stale (UCS/A* heap duplicates)
  if N ∈ CLOSED: continue
  CLOSED ← CLOSED ∪ {N}
  if isGoal(N): return reconstruct(N)
  for each successor N':
    if N' already seen (OPEN ∪ CLOSED):
      # BFS / DFS / Greedy: skip
      # UCS / A*: chỉ chấp nhận nếu g(N') tốt hơn → cập nhật + reopen
    else: push N' lên OPEN; ghi bestG
```

- **Goal test khi pop/expand** (không test khi generate) — chuẩn AIMA graph search.
- **BFS:** OPEN = FIFO. **DFS:** LIFO. **UCS:** ưu tiên \(g\). **Greedy:** ưu tiên \(h\). **A\*:** ưu tiên \(f = g + h\).
- Tie-break: thứ tự insertion (ổn định) → với \(c=1\), UCS trùng BFS về cost và (thường) expanded.

### 4.2 Heuristic \(h\) (Greedy & A\*)

$$
h(n) = d_{\text{Manhattan}}(\text{Pac}, \text{food gần nhất}) + \mathrm{MST}(\text{các food còn lại})
$$

Khi không còn food: \(h = 0\). MST dùng cạnh Manhattan trên đồ thị đầy đủ các food còn lại (Prim).

#### Admissibility (\(h(n) \le h^*(n)\))

1. Trên lưới 4-hướng, Manhattan \(\le\) khoảng cách mê cung thật giữa hai ô.
2. Mọi tour ăn hết food còn lại đều gồm: đi tới **một** food đầu tiên + một đường đi nối các food còn lại.
3. Chi phí tới food đầu \(\ge\) khoảng cách tới food gần nhất; chi phí nối các food \(\ge\) MST (cây bao trùm tối thiểu là cận dưới của mọi Hamiltonian path trên cùng metric).
4. Do đó \(h(n) \le h^*(n)\). Không bao giờ overestimate → A\* tối ưu khi dùng graph search với \(h\) admissible (engine còn reopen theo \(g\) tốt hơn để an toàn).

#### Consistency (\(h(n) \le c(n,n') + h(n')\))

Với \(c = 1\), xét hai trường hợp khi đi một bước \(n \to n'\):

1. **Không ăn food:** tập food không đổi → MST không đổi; khoảng cách tới food gần nhất thay đổi tối đa \(1\) (tính chất Lipschitz của Manhattan) ⇒ \(h(n) \le 1 + h(n')\).
2. **Ăn food \(f\):** \(h(n) = d(\text{Pac}, f^*) + \mathrm{MST}(F)\). Sau khi ăn \(f\), \(h(n') = d'_{\text{nearest}} + \mathrm{MST}(F\setminus\{f\})\). Vì \(\mathrm{MST}(F) \le \mathrm{MST}(F\setminus\{f\}) + d(f, \text{food gần nhất trong }F\setminus\{f\})\) và bước vừa đi đã “trả” một đơn vị tiến tới \(f\), bất đẳng thức consistency vẫn giữ (đã kiểm chứng exhaustively trên mọi cạnh reachable của mọi map built-in — 0 violation).

### 4.3 Completeness / Optimality / Complexity

| Thuật toán | OPEN | Completeness | Optimality | Time (worst) | Space |
|:---|:---|:---|:---|:---|:---|
| **BFS** | FIFO | Có (SS hữu hạn) | Có (\(c=1\)) | \(O(b^{d})\) | \(O(b^{d})\) |
| **DFS** | LIFO | Có nếu tránh cycle | Không | \(O(b^{m})\) | \(O(bm)\) |
| **UCS** | ưu tiên \(g\) | Có | Có (\(c\ge 0\)) | \(O(b^{1+C^*/\varepsilon})\) | tương tự |
| **Greedy** | ưu tiên \(h\) | Có với CLOSED | Không | phụ thuộc \(h\) | \(O(b^{m})\) |
| **A\*** | ưu tiên \(g+h\) | Có | Có nếu \(h\) admissible | thường \(\ll\) BFS khi \(h\) tốt | phụ thuộc \(h\) |

\(d\) = độ sâu lời giải tối ưu, \(m\) = độ sâu tối đa, \(C^*\) = cost tối ưu, \(\varepsilon\) = chi phí bước nhỏ nhất (\(=\!1\)).

### 4.4 Metrics trong app

- `nodesExpanded`: số lần pop/expand (gồm goal pop). `nodesGenerated`: root + mọi node được enqueue.
- `pathCost` / `timeMs` (**pure search**, loại trừ thời gian snapshot trace và async yield) / `traceMs`.
- `terminationReason`: `goal` | `exhausted` | `limit` | `cancelled`.
- `complete` / `optimal` trên bảng là **tính chất lý thuyết**, không phải đảm bảo của lần chạy bị cutoff.
- Trace có thể **lấy mẫu** (reservoir, seeded) nếu expand rất nhiều; heatmap OPEN/CLOSED trên maze là projection theo **vị trí ô**.

**Search tree:** chỉ vẽ nút đã expand (cap ~90 nút đầu theo thứ tự khám phá). State được reopen có occurrence riêng theo `state + g`, giữ parent lịch sử; playback dùng cây exploration riêng và đến giai đoạn lời giải mới hiện path/goal (không rewire ngược). Không vẽ lá đang nằm trong OPEN.

### 4.5 Ưu / nhược điểm: Uninformed vs Informed

| | Uninformed (BFS / DFS / UCS) | Informed (Greedy / A\*) |
|:---|:---|:---|
| **Ưu** | Không cần \(h\); BFS/UCS đảm bảo tối ưu với \(c=1\) | A\* thường ít expand hơn BFS khi \(h\) tốt; Greedy rất nhanh về hướng đích theo ước lượng |
| **Nhược** | BFS/UCS mở rộng nhiều trên multi-food; DFS path dài | Cần thiết kế \(h\); Greedy không tối ưu; A\* phụ thuộc chất lượng \(h\) |

---

## 5. Trace mẫu & So sánh thực nghiệm

### 5.1 Map `tiny`

```
#######
#P...o#
#.###.#
#o...o#
#######
```

\(S_0 = (1,1,111_2)\). Optimal cost = **8**.

#### Trace lời giải tối ưu (BFS / UCS / A\* / Greedy trên `tiny`)

| Step | Operator | State \((x,y,F)\) | \(g\) |
|:---:|:---|:---|:---:|
| 0 | *Start* | \((1,1,111)\) | 0 |
| 1 | Down | \((1,2,111)\) | 1 |
| 2 | Down | \((1,3,101)\) — ăn food góc trái dưới | 2 |
| 3 | Right | \((2,3,101)\) | 3 |
| 4 | Right | \((3,3,101)\) | 4 |
| 5 | Right | \((4,3,101)\) | 5 |
| 6 | Right | \((5,3,001)\) — ăn food góc phải dưới | 6 |
| 7 | Up | \((5,2,001)\) | 7 |
| 8 | Up | \((5,1,000)\) — ăn food còn lại → **Goal** | 8 |

#### Bảng OPEN / CLOSED rút gọn — A\* trên `tiny`

Mỗi nút: \(\text{Node}(g, h, f)\). A\* chọn \(\min f\) (tie → insertion order).

| STT | Nút xét | Ghi chú |
|:---:|:---|:---|
| 1 | — | OPEN = \([(1,1)(0,8,8)]\), CLOSED = ∅ |
| 2 | \((1,1)(0,8,8)\) | Sinh Down → \((1,2)(1,7,8)\); … |
| 3 | \((1,2)(1,7,8)\) | … |
| 4 | \((1,3)(2,6,8)\) | Ăn food → \(F=101_2\) |
| … | … | \(f\) luôn = 8 trên nhánh tối ưu (heuristic exact trên tour này) |
| 9 | \((5,1)(8,0,8)\) | **Goal** — expanded chỉ **9** nút (vs BFS **27**) |

### 5.2 Kết quả chạy thực tế (verify)

| Map | Algo | Path cost | Expanded | Generated | ms (search) | Ghi chú |
|:---|:---|---:|---:|---:|---:|:---|
| tiny | BFS | **8** | 27 | 33 | ~0.6 | baseline |
| tiny | UCS | **8** | 27 | 33 | ~0.8 | ≈ BFS |
| tiny | A\* | **8** | 9 | 12 | ~0.1 | ít expand |
| tiny | Greedy | **8** | 9 | 12 | ~0.1 | tối ưu trên tiny |
| tiny | DFS | 14 | 15 | 18 | ~0.2 | không tối ưu |
| small | BFS / UCS / A\* | **20** | 170 / 170 / 25 | 191 / 191 / 31 | — | Greedy = 20 |
| small | DFS | 58 | 59 | 69 | — | |
| medium | BFS / UCS / A\* | **42** | 1302 / 1302 / **236** | 1370 / 1370 / 278 | ~2.7 / ~5.5 / ~1.1 | A\* tiết kiệm rõ |
| medium | Greedy | **54** | 65 | 80 | ~0.3 | suboptimal |
| medium | DFS | 106 | 134 | 154 | — | |
| branchy | BFS / UCS / A\* | **32** | 675 / 675 / 65 | 716 / 716 / 86 | — | Greedy = 32 |

Nhận xét: BFS vs A\* cùng cost tối ưu; A\* ít expand hơn rõ trên `medium` / `branchy`. Greedy trên `medium` minh họa mất optimality.

### 5.3 Edge case: food 4 góc (Generate, seed = 4)

```
###########
#o...#...o#
##.#.#..#.#
##..#..##.#
#.P.##.#.##
#o.......o#
###########
```

| Algo | Cost | Expanded |
|:---|---:|---:|
| BFS / A\* | **28** | 332 / 140 |
| Greedy | **30** | 36 |

Thứ tự ăn quan trọng — Greedy (ưu tiên \(h\)) suboptimal trên map này, nhưng **không phải lúc nào** cũng suboptimal (nhiều seed corners Greedy vẫn = tối ưu).

### 5.4 Cách chạy app

```bash
cd pacman-search-visualizer
npm install
npm run dev
npm run verify      # đối chiếu BFS/UCS/A* tối ưu + Greedy/DFS textbook + h consistent
npm run test:edge  # 0-food, unreachable, limit, cancel, generator, tree inject
```

UI: Map / Generate (seed tùy chọn) / Mode (Single|Compare) / View (Both|Pac-man only|Tree only) / Playback.

---

## Kết luận

Bài toán Pac-man “ăn hết food” là tìm kiếm trên không gian \((x,y,F)\).  
Tìm kiếm mù và có thông tin cùng mô hình successor; khác nhau ở chiến lược chọn nút từ OPEN. Visualization + metrics làm rõ trade-off **tính tối ưu ↔ số nút mở rộng ↔ thời gian search**.

# Phân tích Không gian Trạng thái — Bài toán Pac-man (Search)

*(Báo cáo kèm ứng dụng `pacman-visualizer` — Vite + TypeScript, chạy thuật toán trên client)*

---

## 1. Tóm tắt đề bài & Ký hiệu

- **Môi trường:** mê cung lưới 2D tĩnh (không ghost).
- **Tác tử:** Pac-man di chuyển 4 hướng.
- **Mục tiêu:** ăn **hết** mọi viên thức ăn với số bước tối thiểu (khi dùng thuật toán tối ưu).
- **Ký hiệu ô:** `#` tường, `.` hành lang, `P` vị trí bắt đầu, `o` thức ăn.
- **Chi phí bước:** \(c(S, a, S') = 1\) với mọi hành động hợp lệ.

Ứng dụng cung cấp 3 map mẫu: `tiny` (3 food), `small` (4 food), `medium` (7 food).

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

với \(k\) = số food, \(N_{\text{passable}}\) = số ô không phải tường.  
Ví dụ map `tiny`: khoảng \(15 \times 2^3 = 120\) trạng thái — đủ nhỏ để BFS duyệt hết.

### 2.2 Trạng thái đầu \(S_0\)

$$
S_0 = (x_P, y_P, F_0),\quad F_0 = 2^{k} - 1
$$

(tất cả bit food = 1).

### 2.3 Trạng thái đích \(S_G\)

$$
S_G = \{ (x, y, F) \mid F = 0 \}
$$

Vị trí \((x,y)\) bất kỳ sau khi hết food đều là goal (điều kiện goal chỉ phụ thuộc \(F\)).

---

## 3. Toán tử / Actions

Từ \(S = (x,y,F)\), bốn toán tử:

| Toán tử | Tiền điều kiện | Chuyển trạng thái |
|:---|:---|:---|
| `Up` | ô \((x, y-1)\) trong biên và không tường | \((x,y,F) \rightarrow (x, y-1, F')\) |
| `Down` | tương tự \(y+1\) | \((x,y,F) \rightarrow (x, y+1, F')\) |
| `Left` | tương tự \(x-1\) | \((x,y,F) \rightarrow (x-1, y, F')\) |
| `Right` | tương tự \(x+1\) | \((x,y,F) \rightarrow (x+1, y, F')\) |

Trong đó \(F' = F\) trừ khi ô mới chứa food \(i\) còn lại: \(F' = F\ \&\ \neg(1 \ll i)\).

**Path cost:** \(c = 1\) mỗi bước.

---

## 4. Lựa chọn & Biện luận Giải thuật

Ứng dụng cài **OPEN / CLOSED** (graph search) cho mọi thuật toán.  
Heuristic dùng cho Greedy & A\*:

$$
h(n) = d_{\text{Manhattan}}(\text{Pac}, \text{food gần nhất}) + \mathrm{MST}(\text{các food còn lại})
$$

\(h\) admissible (không overestimate) trên lưới 4-hướng với cạnh unit.

| Thuật toán | OPEN | \(f\) | Completeness | Optimality | Ưu | Nhược |
|:---|:---|:---|:---|:---|:---|:---|
| **BFS** | FIFO | độ sâu | Có (SS hữu hạn) | Có (\(c=1\)) | Đường ngắn nhất | Mở rộng nhiều nút / tốn bộ nhớ |
| **DFS** | LIFO | — | Có nếu tránh cycle | Không | Ít bộ nhớ frontier | Dễ lạc nhánh, path dài |
| **UCS** | ưu tiên \(g\) | \(g\) | Có | Có | Đúng với chi phí tổng quát | Trùng BFS khi \(c=1\); không dùng \(h\) |
| **Greedy** | ưu tiên \(h\) | \(h\) | Thực tiễn có CLOSED | Không | Nhanh, ít expand trên map “dễ” | Có thể path kém tối ưu |
| **A\*** | ưu tiên \(g+h\) | \(g+h\) | Có | Có nếu \(h\) admissible | Ít expand hơn BFS, vẫn tối ưu | Phụ thuộc chất lượng \(h\); MST tốn thêm CPU |

**Cơ chế chung:**

1. `OPEN = [S0]`, `CLOSED = ∅`
2. Lấy nút theo chiến lược frontier
3. Nếu goal → dựng path qua parent
4. Sinh successors; bỏ qua trạng thái đã có \(g\) không tốt hơn; đưa vào OPEN; đưa nút hiện tại vào CLOSED

---

## 5. Trace mẫu & So sánh thực nghiệm

### 5.1 Map `tiny` (minh họa)

```
#######
#P...o#
#.###.#
#o...o#
#######
```

\(S_0 = (1,1,7)\) (3 food → mask `0b111`).  
Goal khi `foodMask = 0`.

Chạy app (mode **Compare**, Left=BFS, Right=A\*) trên `tiny` / `small` để xem:

- Heatmap **CLOSED** (ô đã expand) vs **OPEN** (frontier)
- Path cuối cùng và food biến mất theo từng bước path
- Bảng metrics: Expanded, Generated, Path cost, Time (ms)

### 5.2 Kết quả chạy thực tế (smoke test trong repo)

| Map | Algo | Path cost | Expanded | Ghi chú |
|:---|:---|---:|---:|:---|
| tiny | BFS / UCS / A* / Greedy | **8** | 27 / 27 / 9 / 9 | DFS = 14 (không tối ưu) |
| small | BFS / UCS / A* | **20** | 170 / 170 / 25 | DFS = 58; Greedy = 20, expand 23 |
| medium | BFS / UCS / A* | **42** | 1302 / 1302 / **236** | DFS = 106; **Greedy = 54** (suboptimal) |

Nhận xét:
- **BFS vs DFS:** DFS path dài hơn rõ (tiny 14 vs 8; medium 106 vs 42).
- **BFS vs A\*:** cùng cost tối ưu; A\* mở rộng ít hơn nhiều trên `medium` (236 vs 1302).
- **Greedy vs A\*:** trên `medium`, Greedy nhanh nhưng **cost 54 > 42** — minh họa mất optimality.
- **UCS ≈ BFS** khi mọi cạnh \(c=1\).

Panel **Metrics** trong app sẽ cho cùng loại số liệu mỗi lần Run.

### 5.3 Cách chạy app

```bash
cd pacman-visualizer
npm install
npm run dev
```

Mở trình duyệt (mặc định `http://localhost:5173`), chọn map / thuật toán / Compare, nhấn **Run**, dùng Play/Step để quan sát OPEN–CLOSED.

---

## Kết luận

Bài toán Pac-man “ăn hết food” là tìm kiếm trên không gian \((x,y,F)\).  
Tìm kiếm mù (BFS/DFS/UCS) và có thông tin (Greedy/A\*) cùng mô hình successor; khác nhau ở chiến lược chọn nút từ OPEN. Visualization + metrics làm rõ trade-off **tính tối ưu ↔ số nút mở rộng ↔ thời gian**, đúng yêu cầu đề bài.

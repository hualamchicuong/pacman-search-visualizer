# Phân tích Không gian Trạng thái — Bài toán Pac-man (Search)

*(Báo cáo kèm ứng dụng `pacman-search-visualizer` — Vite + TypeScript, chạy thuật toán trên client)*

---

## 1. Tóm tắt đề bài & Ký hiệu

- **Môi trường:** mê cung lưới 2D tĩnh (không ghost).
- **Tác tử:** Pac-man di chuyển 4 hướng.
- **Mục tiêu:** ăn **hết** mọi viên thức ăn với số bước tối thiểu (khi dùng thuật toán tối ưu).
- **Ký hiệu ô:** `#` tường, `.` hành lang, `P` vị trí bắt đầu, `o` thức ăn, `F` = start+food (food bị ăn ngay ở \(S_0\)).
- **Chi phí bước:** \(c(S, a, S') = 1\) với mọi hành động hợp lệ.

Ứng dụng cung cấp map mẫu: `tiny` (3 food), `small` (4 food), `medium` (7 food), `branchy` (4 food ở góc / ngã tư), cùng **Generate** (custom: số food, start exits 2–4, tùy chọn food 4 góc).

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
Ví dụ map `tiny`: \(12 \times 2^3 = 96\) trạng thái (cận trên) — đủ nhỏ để BFS duyệt hết. Không phải mọi tổ hợp \((x,y,F)\) đều reachable.

### 2.2 Trạng thái đầu \(S_0\)

$$
S_0 = (x_P, y_P, F_0)
$$

\(F_0\) = full mask, trừ bit food tại ô start nếu layout dùng `F`.

### 2.3 Trạng thái đích \(S_G\)

$$
S_G = \{ (x, y, F) \mid F = 0 \}
$$

Vị trí \((x,y)\) bất kỳ sau khi hết food đều là goal. Map 0 food → goal ngay tại root (cost 0).

---

## 3. Toán tử / Actions

Từ \(S = (x,y,F)\), bốn toán tử: `Up` / `Down` / `Left` / `Right` (biên + không tường).  
\(F' = F\) trừ khi ô mới chứa food \(i\) còn lại. **Path cost:** \(c = 1\) mỗi bước.

---

## 4. Lựa chọn & Biện luận Giải thuật

Ứng dụng cài **OPEN / CLOSED** (graph search) cho mọi thuật toán.  
Heuristic dùng cho Greedy & A\*:

$$
h(n) = d_{\text{Manhattan}}(\text{Pac}, \text{food gần nhất}) + \mathrm{MST}(\text{các food còn lại})
$$

\(h\) admissible (và consistent trên lưới 4-hướng unit cost). Greedy **chọn state có \(h\) nhỏ nhất** trên frontier — không phải “luôn chạy thẳng tới food gần nhất” theo nghĩa path-greedy đơn giản.

| Thuật toán | OPEN | Completeness (lý thuyết) | Optimality | Ghi chú |
|:---|:---|:---|:---|:---|
| **BFS** | FIFO | Có (SS hữu hạn) | Có (\(c=1\)) | Baseline tối ưu |
| **DFS** | LIFO | Có nếu tránh cycle | Không | Path có thể rất dài |
| **UCS** | ưu tiên \(g\) | Có | Có | ≈ BFS khi \(c=1\) |
| **Greedy** | ưu tiên \(h\) | Có với CLOSED | Không | Trên food 4 góc có thể suboptimal |
| **A\*** | ưu tiên \(g+h\) | Có | Có nếu \(h\) admissible | Ít expand hơn BFS |

**Metrics trong app:**
- `nodesExpanded` / `nodesGenerated` / `pathCost` / `timeMs`
- `terminationReason`: `goal` | `exhausted` (OPEN cạn) | `limit` (cắt ở max expand)
- `complete` / `optimal` trên bảng là **tính chất lý thuyết**, không phải đảm bảo của lần chạy bị cutoff
- Trace có thể **lấy mẫu** (reservoir) nếu expand rất nhiều; heatmap OPEN/CLOSED trên maze là projection theo **vị trí ô**, không phải tập state đầy đủ

**Search tree:** giữ thứ tự khám phá (cap ~90 nút đầu); khi tìm thấy goal sẽ **gắn thêm** chuỗi path/goal dù cây bị cắt.

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

Chạy app (mode **Compare**, Top=BFS, Bottom=A\*) trên `tiny` / `small` / `medium` / `branchy`.

### 5.2 Kết quả chạy thực tế (smoke / verify)

| Map | Algo | Path cost | Expanded | Ghi chú |
|:---|:---|---:|---:|:---|
| tiny | BFS / UCS / A* / Greedy | **8** | 27 / 27 / 9 / 9 | DFS = 14 (không tối ưu) |
| small | BFS / UCS / A* | **20** | 170 / 170 / 25 | DFS = 58; Greedy = 20 |
| medium | BFS / UCS / A* | **42** | 1302 / 1302 / **236** | DFS = 106; **Greedy = 54** (suboptimal) |

Nhận xét: BFS vs A\* cùng cost tối ưu; A\* ít expand hơn trên `medium`. Greedy trên `medium` minh họa mất optimality. Food 4 góc (Generate / một số layout) là edge case thứ tự ăn — Greedy không luôn suboptimal.

### 5.3 Cách chạy app

```bash
cd pacman-search-visualizer
npm install
npm run dev
```

UI: Map / Generate / Mode (Single|Compare) / View (Both|Pac-man only|Tree only) / Playback.

---

## Kết luận

Bài toán Pac-man “ăn hết food” là tìm kiếm trên không gian \((x,y,F)\).  
Tìm kiếm mù và có thông tin cùng mô hình successor; khác nhau ở chiến lược chọn nút từ OPEN. Visualization + metrics làm rõ trade-off **tính tối ưu ↔ số nút mở rộng ↔ thời gian**.

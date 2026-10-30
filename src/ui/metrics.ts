import type { Maze } from '../core/maze'
import { ALGORITHM_META, type SearchMetrics, type SearchResult } from '../core/types'
import { hasFoodsAtFourCorners } from '../maps/generate'

function optLabel(v: boolean | 'conditional'): string {
  if (v === true) return 'Yes (guaranteed)'
  if (v === false) return 'No'
  return 'Yes if h is admissible'
}

function terminationLabel(m: SearchMetrics): string {
  if (m.terminationReason === 'goal') return 'goal'
  if (m.terminationReason === 'limit') return 'hit expand limit'
  if (m.terminationReason === 'cancelled') return 'cancelled'
  return 'OPEN exhausted'
}

export function renderMetrics(container: HTMLElement, results: SearchResult[]): void {
  if (results.length === 0) {
    container.innerHTML = '<p style="margin:0;color:var(--muted);font-size:0.88rem;">No runs yet.</p>'
    return
  }

  const rows = results
    .map((r) => {
      const m = r.metrics
      const meta = ALGORITHM_META[m.algorithm]
      const traceNote = m.traceSampled
        ? `sampled ${m.traceRecorded}/${m.nodesExpanded}`
        : String(m.traceRecorded)
      return `<tr>
        <td>${m.algorithm}</td>
        <td>${m.found ? 'Yes' : 'No'}</td>
        <td>${m.nodesExpanded}</td>
        <td>${m.nodesGenerated}</td>
        <td>${m.pathCost ?? '—'}</td>
        <td>${m.timeMs}</td>
        <td>${terminationLabel(m)}</td>
        <td>${meta.complete ? 'Yes' : 'No'}</td>
        <td>${optLabel(meta.optimal)}</td>
        <td>${traceNote}</td>
      </tr>`
    })
    .join('')

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Algo</th>
          <th>Found</th>
          <th>Expanded</th>
          <th>Generated</th>
          <th>Cost</th>
          <th>ms (search)</th>
          <th>Stop</th>
          <th>Complete†</th>
          <th>Optimal†</th>
          <th>Trace</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0.45rem 0 0;font-size:0.72rem;color:var(--muted);">† Complete/Optimal = theoretical properties, not this run. ms (search) excludes trace snapshot time. OPEN/CLOSED on maze are position heatmaps.</p>
  `
}

/** Structured insight HTML (sections, not one paragraph). */
export function renderInsight(
  container: HTMLElement,
  results: SearchResult[],
  maze?: Maze | null,
): void {
  if (results.length === 0) {
    container.innerHTML = `
      <p class="insight-empty">Chọn thuật toán và nhấn <strong>Run</strong> để xem phân tích.</p>
    `
    return
  }

  const m = maze ?? null

  if (results.length === 1) {
    container.innerHTML = singleInsightHtml(results[0]!.metrics, m)
    return
  }

  const sections: string[] = []

  const byExpand = [...results].sort(
    (a, b) => a.metrics.nodesExpanded - b.metrics.nodesExpanded,
  )
  const lean = byExpand[0]!
  const heavy = byExpand[byExpand.length - 1]!
  sections.push(`
    <div class="insight-block">
      <h4>1. Số nút mở rộng (Expanded)</h4>
      <ul>
        ${byExpand
          .map(
            (r) =>
              `<li><strong>${r.algorithm}</strong>: ${r.metrics.nodesExpanded} nút</li>`,
          )
          .join('')}
      </ul>
      <p class="insight-verdict">${
        lean.metrics.nodesExpanded < heavy.metrics.nodesExpanded
          ? `${lean.algorithm} mở rộng ít hơn ${heavy.algorithm} (${lean.metrics.nodesExpanded} vs ${heavy.metrics.nodesExpanded}) — thường tiết kiệm hơn về khám phá (không đồng nghĩa ít RAM/CPU tuyệt đối).`
          : 'Các thuật toán mở rộng cùng số nút trên lần chạy này.'
      }</p>
      ${expandContextHtml(m)}
    </div>
  `)

  const withPath = results.filter((r) => r.found && r.metrics.pathCost !== null)
  if (withPath.length > 0) {
    const byCost = [...withPath].sort(
      (a, b) => (a.metrics.pathCost ?? 0) - (b.metrics.pathCost ?? 0),
    )
    const best = byCost[0]!
    const worst = byCost[byCost.length - 1]!
    const same = (best.metrics.pathCost ?? 0) === (worst.metrics.pathCost ?? 0)
    sections.push(`
      <div class="insight-block">
        <h4>2. Chi phí đường đi (Path cost)</h4>
        <ul>
          ${byCost
            .map(
              (r) =>
                `<li><strong>${r.algorithm}</strong>: ${r.metrics.pathCost} bước${
                  r === best ? ' ← thấp nhất trong so sánh' : ''
                }</li>`,
            )
            .join('')}
        </ul>
        <p class="insight-verdict">${
          same
            ? `Các lời giải đang so sánh có cùng cost = ${best.metrics.pathCost} trên map này.`
            : `${worst.algorithm} dài hơn ${best.algorithm} (${worst.metrics.pathCost} vs ${best.metrics.pathCost}) trong các run hiện tại — thuật toán không tối ưu có thể trả path dài hơn.`
        }</p>
        ${costContextHtml(m)}
      </div>
    `)
  }

  const optimalNow = withPath.length
    ? [...withPath].sort((a, b) => (a.metrics.pathCost ?? 0) - (b.metrics.pathCost ?? 0))[0]!
    : null

  sections.push(
    recommendHtml({
      heading: '3. Gợi ý thuật toán tối ưu',
      maze: m,
      pickHtml: optimalNow
        ? `<p class="insight-pick">Trong các lần chạy đang so sánh, cost thấp nhất thuộc về: <strong>${optimalNow.algorithm}</strong> (cost = ${optimalNow.metrics.pathCost}).</p>`
        : '',
    }),
  )

  container.innerHTML = sections.join('')
}

function expandContextHtml(maze: Maze | null): string {
  if (!maze) return ''
  if (hasFoodsAtFourCorners(maze)) {
    return `<p class="insight-verdict">Map <strong>food 4 góc</strong>: có tới 2<sup>4</sup> cấu hình food còn lại × vị trí Pac-man — BFS thường expand nhiều; A* vẫn có lợi nếu h dẫn tốt.</p>`
  }
  if (maze.foods.length >= 3) {
    return `<p class="insight-verdict">Multi-food (k=${maze.foods.length}): state ≈ vị trí × 2<sup>k</sup> — càng nhiều food, chênh expanded BFS vs A* thường càng rõ.</p>`
  }
  return ''
}

function costContextHtml(maze: Maze | null): string {
  if (!maze || !hasFoodsAtFourCorners(maze)) return ''
  return `<p class="insight-verdict">Edge case 4 góc: thứ tự ăn quan trọng — <strong>Greedy</strong> (ưu tiên h = nearest+MST) có thể suboptimal; so với BFS/A* để thấy. Không phải lúc nào cũng suboptimal.</p>`
}

function singleInsightHtml(m: SearchMetrics, maze: Maze | null): string {
  const meta = ALGORITHM_META[m.algorithm]
  if (!m.found) {
    const why =
      m.terminationReason === 'limit'
        ? `dừng vì <strong>giới hạn mở rộng</strong> (${m.nodesExpanded} nút) — OPEN có thể vẫn còn.`
        : m.terminationReason === 'cancelled'
          ? `bị <strong>hủy</strong> giữa chừng (${m.nodesExpanded} nút đã expand).`
          : `OPEN đã <strong>cạn</strong> (${m.nodesExpanded} nút) — thường do food unreachable / không còn successor.`
    return `
      <div class="insight-block">
        <h4>Kết quả</h4>
        <p><strong>${m.algorithm}</strong> không tìm thấy lời giải: ${why}</p>
      </div>
      ${recommendHtml({ heading: '2. Gợi ý thuật toán tối ưu', maze, pickHtml: '' })}
    `
  }
  const sample =
    m.traceSampled
      ? `<li>Trace: đã lấy mẫu ${m.traceRecorded}/${m.nodesExpanded} expand</li>`
      : ''
  return `
    <div class="insight-block">
      <h4>1. Kết quả chạy</h4>
      <ul>
        <li>Thuật toán: <strong>${m.algorithm}</strong></li>
        <li>Path cost: <strong>${m.pathCost}</strong></li>
        <li>Expanded: ${m.nodesExpanded}</li>
        <li>Generated: ${m.nodesGenerated}</li>
        <li>Stop: ${terminationLabel(m)}</li>
        <li>Thời gian: ${m.timeMs} ms</li>
        ${sample}
      </ul>
    </div>
    <div class="insight-block">
      <h4>2. Tính chất lý thuyết</h4>
      <ul>
        <li>Completeness (lý thuyết): ${meta.complete ? 'Có' : 'Không'}</li>
        <li>Optimality (lý thuyết): ${optLabel(meta.optimal)}</li>
      </ul>
      ${
        maze && hasFoodsAtFourCorners(maze)
          ? `<p class="insight-verdict">Đang chạy layout <strong>food 4 góc</strong> — thứ tự ăn ảnh hưởng Greedy/DFS nhiều hơn.</p>`
          : ''
      }
    </div>
    ${recommendHtml({ heading: '3. Gợi ý thuật toán tối ưu', maze, pickHtml: '' })}
  `
}

function recommendHtml(opts: {
  heading: string
  maze: Maze | null
  pickHtml: string
}): string {
  const corners = opts.maze ? hasFoodsAtFourCorners(opts.maze) : false
  const multi = opts.maze ? opts.maze.foods.length >= 3 : false

  const list = corners
    ? `
        <li><strong>BFS</strong> — <span class="insight-explain">tối ưu với <code>c = 1</code>; baseline đo thứ tự ăn trên 4 góc.</span></li>
        <li><strong>UCS</strong> — <span class="insight-explain">tương đương BFS khi mọi bước cost bằng 1.</span></li>
        <li><strong>A*</strong> — <span class="insight-explain">tối ưu nếu h admissible (nearest + MST); thường ít expand hơn BFS.</span></li>
        <li><strong>Greedy</strong> — <span class="insight-explain">chọn state có <code>h</code> nhỏ nhất (nearest+MST), <em>không</em> đảm bảo tối ưu; trên 4 góc dễ suboptimal nhưng không luôn.</span></li>
        <li><strong>DFS</strong> — <span class="insight-explain">dễ path rất dài — chỉ minh họa.</span></li>
      `
    : `
        <li><strong>BFS</strong> — <span class="insight-explain">tối ưu khi mọi bước có chi phí <code>c = 1</code>.</span></li>
        <li><strong>UCS</strong> — <span class="insight-explain">tối ưu với chi phí không âm; khi <code>c = 1</code> tương đương BFS.</span></li>
        <li><strong>A*</strong> — <span class="insight-explain">tối ưu nếu heuristic <em>admissible</em>; thường mở rộng ít hơn BFS.</span></li>
        <li><strong>DFS</strong> — <span class="insight-explain"><em>không</em> đảm bảo tối ưu.</span></li>
        <li><strong>Greedy</strong> — <span class="insight-explain">chọn state có <code>h</code> nhỏ nhất (nearest+MST); <em>không</em> đảm bảo tối ưu${
          multi ? '; multi-food dễ lộ path kém' : ''
        }.</span></li>
      `

  const verdict = corners
    ? `Edge case <strong>food 4 góc</strong>: so sánh <strong>BFS/A*</strong> với <strong>Greedy</strong> để quan sát trade-off thứ tự ăn.`
    : `Với bài Pac-man (<code>c = 1</code>): ưu tiên <strong>BFS</strong> hoặc <strong>A*</strong> khi cần lời giải tối ưu; DFS/Greedy để minh họa trade-off.`

  return `
    <div class="insight-block insight-recommend">
      <h4>${opts.heading}</h4>
      <ul class="recommend-list">${list}</ul>
      ${opts.pickHtml}
      <p class="insight-verdict">${verdict}</p>
    </div>
  `
}


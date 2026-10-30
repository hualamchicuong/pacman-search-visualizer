import type { TreeNode } from './searchTree'
import { filterTreeByStep, flattenTree, MAX_TREE_NODES } from './searchTree'

const H_GAP = 118
const V_GAP = 100
const PAD_X = 56
const PAD_Y = 48
const NODE_W = 104
const NODE_H = 54

/**
 * Interactive SVG tree that GROWS with search expansions.
 * Full exploration tree is stored; setProgress reveals nodes in algorithm order.
 */
export class TreeRenderer {
  private svg: SVGSVGElement
  private world: SVGGElement
  private highlightId: string | null = null
  /** Full chronological exploration tree */
  private fullTree: TreeNode | null = null
  private solutionTree: TreeNode | null = null
  /** Currently painted (possibly filtered) tree */
  private tree: TreeNode | null = null
  private contentW = 1
  private contentH = 1
  private scale = 1
  private panX = 0
  private panY = 0
  private minScale = 0.2
  private maxScale = 3
  private dragging = false
  private lastX = 0
  private lastY = 0
  private lastProgress = -1
  private lastRevealPath = false
  private nodeEls = new Map<string, { rect: SVGRectElement; node: TreeNode }>()
  private ro: ResizeObserver
  /** After user pans/zooms, auto-fit on each step is suppressed until Fit */
  private userAdjustedView = false

  constructor(
    private viewport: HTMLElement,
    private captionEl: HTMLElement,
  ) {
    this.viewport.classList.add('tree-viewport')
    this.viewport.innerHTML = ''

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.classList.add('tree-svg')
    this.svg.setAttribute('role', 'img')
    this.svg.setAttribute('aria-label', 'Search tree visualization')
    this.svg.setAttribute('width', '100%')
    this.svg.setAttribute('height', '100%')

    this.world = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.world.classList.add('tree-world')
    this.svg.appendChild(this.world)
    this.viewport.appendChild(this.svg)

    this.bindInteractions()
    this.ro = new ResizeObserver(() => {
      if (!this.tree) return
      // Keep user pan/zoom; Fit button / double-click / key 0 still refit
      if (this.userAdjustedView) return
      this.fitToView()
    })
    this.ro.observe(this.viewport)

    this.clear()
  }

  static attach(viewport: HTMLElement, caption: HTMLElement): TreeRenderer {
    return new TreeRenderer(viewport, caption)
  }

  clear(message = 'Nhấn Run — cây sẽ mọc theo thứ tự mở rộng của thuật toán.'): void {
    this.fullTree = null
    this.solutionTree = null
    this.tree = null
    this.highlightId = null
    this.lastProgress = -1
    this.lastRevealPath = false
    this.userAdjustedView = false
    this.nodeEls.clear()
    this.world.innerHTML = ''
    this.scale = 1
    this.panX = 0
    this.panY = 0
    this.applyTransform()

    const { w, h } = this.viewportSize()
    const t = svgEl('text', {
      x: String(w / 2),
      y: String(h / 2),
      'text-anchor': 'middle',
      fill: '#8b9aab',
      'font-size': '15',
      'font-family': 'DM Sans, sans-serif',
    })
    t.textContent = message
    this.world.appendChild(t)
    this.captionEl.textContent =
      `Cây khám phá — chỉ nút đã expand (≤${MAX_TREE_NODES} đầu + path/goal) · zoom/kéo · double-click = fit`
  }

  /** True after user pan/zoom — callers should preserve view during playback. */
  hasUserAdjustedView(): boolean {
    return this.userAdjustedView
  }

  /** Store full exploration tree; start at progress 0 (root only as search begins). */
  setTree(root: TreeNode | null, solution: TreeNode | null = root): void {
    this.solutionTree = solution
    this.fullTree = root
    this.highlightId = null
    this.lastProgress = -1
    this.userAdjustedView = false
    if (!root) {
      this.clear()
      return
    }
    this.setProgress(0, false, false)
  }

  /**
   * Grow / paint tree up to expansion step.
   * @param step index into search steps (discoveredAt)
   * @param revealPath if true, color the eventual solution (after goal found)
   * @param preserveView keep pan/zoom (during playback)
   */
  setProgress(step: number, revealPath: boolean, preserveView = true): void {
    if (!this.fullTree) return
    if (step === this.lastProgress && revealPath === this.lastRevealPath && this.tree) {
      return
    }
    this.lastProgress = step
    this.lastRevealPath = revealPath

    const keepView = preserveView || this.userAdjustedView
    const saved = keepView
      ? { scale: this.scale, panX: this.panX, panY: this.panY }
      : null

    const activeTree = revealPath ? (this.solutionTree ?? this.fullTree) : this.fullTree
    let visible = filterTreeByStep(activeTree, step)
    if (!revealPath) {
      visible = mapTree(visible, (n) => ({
        ...n,
        onPath: false,
        isGoal: false,
      }))
      layoutTreeLocal(visible)
    }

    this.paint(visible)

    if (saved) {
      this.scale = saved.scale
      this.panX = saved.panX
      this.panY = saved.panY
      this.minScale = Math.min(this.minScale, saved.scale * 0.5)
      this.applyTransform()
    } else {
      this.fitToView()
    }

    const nodes = flattenTree(visible)
    const fullCount = this.fullTree ? flattenTree(this.fullTree).length : nodes.length
    const capped = fullCount >= MAX_TREE_NODES
    const mode = revealPath
      ? 'đã tô path/goal (gắn thêm nếu cây bị cắt)'
      : 'đang khám phá (chưa biết đích)'
    const capNote = capped
      ? ` · hiển thị ≤${MAX_TREE_NODES} nút khám phá đầu (+ path)`
      : ''
    this.captionEl.textContent =
      `${nodes.length} nút (đã expand, chưa vẽ lá OPEN) · ${mode}${capNote} · cam = path · double-click fit`
  }

  setHighlight(highlightId: string | null): void {
    if (this.highlightId === highlightId) return
    const prev = this.highlightId
    this.highlightId = highlightId
    if (prev && this.nodeEls.has(prev)) this.styleRect(prev, false)
    if (highlightId && this.nodeEls.has(highlightId)) this.styleRect(highlightId, true)
  }

  fitToView(): void {
    if (!this.tree) return
    this.userAdjustedView = false
    const { w, h } = this.viewportSize()
    if (w < 2 || h < 2) return
    const pad = 16
    const sx = (w - pad * 2) / Math.max(this.contentW, 1)
    const sy = (h - pad * 2) / Math.max(this.contentH, 1)
    this.scale = Math.min(sx, sy)
    this.minScale = Math.min(sx, sy) * 0.35
    this.maxScale = Math.max(3.5, this.scale * 4)
    this.panX = (w - this.contentW * this.scale) / 2
    this.panY = (h - this.contentH * this.scale) / 2
    this.applyTransform()
  }

  private paint(root: TreeNode): void {
    this.tree = root
    const nodes = flattenTree(root)
    const maxX = Math.max(...nodes.map((n) => n.x), 0)
    const maxD = Math.max(...nodes.map((n) => n.depth), 0)
    this.contentW = PAD_X * 2 + maxX * H_GAP + NODE_W
    this.contentH = PAD_Y * 2 + maxD * V_GAP + NODE_H

    this.world.innerHTML = ''
    this.nodeEls.clear()

    const px = (n: TreeNode): number => PAD_X + n.x * H_GAP + NODE_W / 2
    const py = (n: TreeNode): number => PAD_Y + n.depth * V_GAP + NODE_H / 2

    this.world.appendChild(
      svgEl('rect', {
        class: 'tree-bg',
        x: '0',
        y: '0',
        width: String(this.contentW),
        height: String(this.contentH),
        fill: '#071018',
        rx: '10',
      }),
    )

    const edges = svgEl('g', { class: 'tree-edges' })
    for (const n of nodes) {
      for (const c of n.children) {
        const x1 = px(n)
        const y1 = py(n) + NODE_H / 2 - 2
        const x2 = px(c)
        const y2 = py(c) - NODE_H / 2 + 2
        const midY = (y1 + y2) / 2
        const onSol = n.onPath && c.onPath
        edges.appendChild(
          svgEl('path', {
            d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
            fill: 'none',
            stroke: onSol ? '#f08c2e' : '#4a5d72',
            'stroke-width': onSol ? '3' : '1.85',
            'stroke-linecap': 'round',
          }),
        )
      }
    }
    this.world.appendChild(edges)

    const layer = svgEl('g', { class: 'tree-nodes' })
    for (const n of nodes) {
      layer.appendChild(this.makeNodeCard(n, px(n), py(n)))
    }
    this.world.appendChild(layer)

    // re-apply highlight after rebuild
    if (this.highlightId && this.nodeEls.has(this.highlightId)) {
      this.styleRect(this.highlightId, true)
    }
  }

  private viewportSize(): { w: number; h: number } {
    const r = this.viewport.getBoundingClientRect()
    return { w: Math.max(r.width, 1), h: Math.max(r.height, 1) }
  }

  private applyTransform(): void {
    this.world.setAttribute(
      'transform',
      `translate(${this.panX}, ${this.panY}) scale(${this.scale})`,
    )
  }

  private bindInteractions(): void {
    this.viewport.style.touchAction = 'none'

    this.viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.tree) return
      this.dragging = true
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.viewport.classList.add('dragging')
      this.viewport.setPointerCapture(e.pointerId)
    })

    this.viewport.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      this.userAdjustedView = true
      this.panX += e.clientX - this.lastX
      this.panY += e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.applyTransform()
    })

    const endDrag = (e: PointerEvent): void => {
      this.dragging = false
      this.viewport.classList.remove('dragging')
      try {
        this.viewport.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    this.viewport.addEventListener('pointerup', endDrag)
    this.viewport.addEventListener('pointercancel', endDrag)

    this.viewport.addEventListener(
      'wheel',
      (e) => {
        if (!this.tree) return
        e.preventDefault()
        const rect = this.viewport.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const next = clamp(this.scale * factor, this.minScale, this.maxScale)
        if (next === this.scale) return
        this.userAdjustedView = true
        const worldX = (mx - this.panX) / this.scale
        const worldY = (my - this.panY) / this.scale
        this.scale = next
        this.panX = mx - worldX * this.scale
        this.panY = my - worldY * this.scale
        this.applyTransform()
      },
      { passive: false },
    )

    this.viewport.addEventListener('dblclick', () => {
      if (this.tree) this.fitToView()
    })

    this.viewport.addEventListener('keydown', (e) => {
      if (e.key === '0' || e.key === 'Home') {
        e.preventDefault()
        if (this.tree) this.fitToView()
      }
    })
    if (!this.viewport.hasAttribute('tabindex')) {
      this.viewport.setAttribute('tabindex', '0')
      this.viewport.setAttribute('aria-label', 'Search tree — scroll to zoom, drag to pan, 0 to fit')
    }
  }

  private styleRect(id: string, highlighted: boolean): void {
    const entry = this.nodeEls.get(id)
    if (!entry) return
    const { stroke } = colorsFor(entry.node)
    entry.rect.setAttribute('stroke', highlighted ? '#ffd60a' : stroke)
    entry.rect.setAttribute('stroke-width', highlighted ? '3.25' : '2')
  }

  private makeNodeCard(n: TreeNode, cx: number, cy: number): SVGGElement {
    const g = svgEl('g', {
      class: 'tree-node',
      transform: `translate(${cx - NODE_W / 2}, ${cy - NODE_H / 2})`,
    }) as SVGGElement

    const { fill, stroke } = colorsFor(n)

    g.appendChild(
      svgEl('rect', {
        x: '3',
        y: '4',
        width: String(NODE_W),
        height: String(NODE_H),
        rx: '12',
        fill: '#00000055',
      }),
    )

    const rect = svgEl('rect', {
      width: String(NODE_W),
      height: String(NODE_H),
      rx: '12',
      ry: '12',
      fill,
      stroke,
      'stroke-width': '2',
    }) as SVGRectElement
    g.appendChild(rect)

    const title = svgEl('text', {
      x: String(NODE_W / 2),
      y: '23',
      'text-anchor': 'middle',
      fill: '#f8fafc',
      'font-size': '15',
      'font-weight': '700',
      'font-family': 'JetBrains Mono, ui-monospace, monospace',
    })
    title.textContent = n.label
    g.appendChild(title)

    const sub = svgEl('text', {
      x: String(NODE_W / 2),
      y: '41',
      'text-anchor': 'middle',
      fill: '#a7b6c7',
      'font-size': '11.5',
      'font-family': 'JetBrains Mono, ui-monospace, monospace',
    })
    sub.textContent = n.sublabel
    g.appendChild(sub)

    this.nodeEls.set(n.id, { rect, node: n })
    return g
  }
}

function mapTree(n: TreeNode, fn: (n: TreeNode) => TreeNode): TreeNode {
  const m = fn(n)
  return {
    ...m,
    children: n.children.map((c) => mapTree(c, fn)),
  }
}

function layoutTreeLocal(root: TreeNode): void {
  const GAP = 1
  let next = 0
  const place = (node: TreeNode, depth: number): void => {
    node.depth = depth
    node.y = depth
    if (node.children.length === 0) {
      node.x = next
      next += GAP
      return
    }
    for (const c of node.children) place(c, depth + 1)
    node.x =
      (node.children[0]!.x + node.children[node.children.length - 1]!.x) / 2
  }
  place(root, 0)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function colorsFor(n: TreeNode): { fill: string; stroke: string } {
  if (n.isGoal) return { fill: '#1b4332', stroke: '#52b788' }
  if (n.onPath) return { fill: '#5c2b0a', stroke: '#f08c2e' }
  return { fill: '#17324a', stroke: '#5b7c9d' }
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Item, ItemList } from './types'

type GraphNode = {
  id: string
  label: string
  kind: 'item' | 'location'
  item?: Item
  x: number
  y: number
  vx: number
  vy: number
}

const WIDTH = 920
const HEIGHT = 560

function initialNodes(items: Item[]): GraphNode[] {
  const locations = [...new Set(items.map((item) => item.location.trim()).filter(Boolean))]
  const nodes: GraphNode[] = items.map((item, index) => ({ id: `item:${item.id}`, label: item.name, kind: 'item' as const, item, x: 170 + (index % 2) * 36, y: 100 + index * 46, vx: 0, vy: 0 }))
  nodes.push(...locations.map((location, index): GraphNode => ({ id: `location:${location}`, label: location, kind: 'location', x: 700 + (index % 2) * 24, y: 100 + index * 62, vx: 0, vy: 0 })))
  return nodes
}

export function InteractiveKnowledgeGraph({ lists, activeList, items, onSelectList, onBack }: { lists: ItemList[]; activeList: string; items: Item[]; onSelectList: (id: string) => void; onBack: () => void }) {
  const [nodes, setNodes] = useState(() => initialNodes(items))
  const [hovered, setHovered] = useState<GraphNode | null>(null)
  const [running, setRunning] = useState(true)
  const dragId = useRef<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const list = lists.find((entry) => entry.id === activeList)
  const itemNodes = useMemo(() => nodes.filter((node) => node.kind === 'item'), [nodes])

  useEffect(() => setNodes(initialNodes(items)), [items])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNodes((current) => current.map((node, index) => {
      if (dragId.current === node.id) return node
      const phase = Date.now() / 900 + index
      const targetX = node.kind === 'item' ? 180 : 710
      const targetY = node.kind === 'item' ? 90 + index * 44 : 90 + index * 58
      return { ...node, vx: node.vx * .82 + (targetX - node.x) * .004 + Math.sin(phase) * .08, vy: node.vy * .82 + (targetY - node.y) * .004 + Math.cos(phase) * .08, x: Math.max(75, Math.min(WIDTH - 75, node.x + node.vx)), y: Math.max(55, Math.min(HEIGHT - 45, node.y + node.vy)) }
    })), 32)
    return () => window.clearInterval(timer)
  }, [running])

  const position = (id: string) => nodes.find((node) => node.id === id)
  const startDrag = (event: PointerEvent<SVGGElement>, node: GraphNode) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse())
    dragId.current = node.id
    dragOffset.current = { x: node.x - local.x, y: node.y - local.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const drag = (event: PointerEvent<SVGGElement>) => {
    const id = dragId.current
    if (!id) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse())
    setNodes((current) => current.map((node) => node.id === id ? { ...node, x: Math.max(55, Math.min(WIDTH - 55, local.x + dragOffset.current.x)), y: Math.max(45, Math.min(HEIGHT - 35, local.y + dragOffset.current.y)), vx: 0, vy: 0 } : node))
  }
  const stopDrag = () => { dragId.current = null }

  return <><header className="topbar"><div><div className="eyebrow">可交互知识图谱</div><h1>{list?.name || '物品'}图谱</h1></div><div className="graph-header-actions"><button className="toolbar-button" onClick={() => setRunning((value) => !value)}>{running ? '暂停运动' : '继续运动'}</button><button className="outline-button" onClick={onBack}>返回物品</button></div></header><div className="graph-toolbar"><span className="muted">拖拽节点调整布局；悬停节点查看详细信息。</span><div className="list-tabs graph-list-tabs">{lists.map((entry) => <button key={entry.id} className={`list-tab ${activeList === entry.id ? 'active' : ''}`} onClick={() => onSelectList(entry.id)}>{entry.icon} {entry.name} <span className="tab-count">{entry.count}</span></button>)}</div></div>{itemNodes.length ? <section className="graph-panel interactive-graph-panel"><svg className="knowledge-graph interactive-graph" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} onPointerMove={drag} onPointerUp={stopDrag}><defs><marker id="interactive-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" /></marker></defs><text x={WIDTH / 2} y="25" textAnchor="middle" className="graph-title">{list?.name || '列表'} · {items.length} 个物品关系</text>{items.map((item) => { const source = position(`item:${item.id}`); const target = position(`location:${item.location.trim()}`); if (!source || !target) return null; return <g key={`edge-${item.id}`}><line className="graph-edge" x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd="url(#interactive-arrow)" /><text className="graph-edge-label" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 7}>{list?.name || '关系'}</text></g> })}{nodes.map((node) => <g key={node.id} className={`graph-node ${node.kind}-node interactive-node`} transform={`translate(${node.x} ${node.y})`} onPointerDown={(event) => startDrag(event, node)} onPointerMove={drag} onPointerUp={stopDrag} onPointerEnter={() => setHovered(node)} onPointerLeave={() => setHovered(null)}><title>{node.kind === 'item' ? `${node.item?.name} · ${node.item?.location}${node.item?.note ? ` · ${node.item.note}` : ''}` : node.label}</title>{node.kind === 'item' ? <circle r="31" /> : <rect x="-88" y="-27" width="176" height="54" rx="14" />}<text textAnchor="middle" y="4">{node.label.length > 16 ? `${node.label.slice(0, 16)}…` : node.label}</text></g>)}</svg>{hovered && <div className="graph-hover-card"><strong>{hovered.label}</strong>{hovered.kind === 'item' && hovered.item ? <><span>列表：{hovered.item.listName}</span><span>位置：{hovered.item.location}</span>{hovered.item.note && <span>备注：{hovered.item.note}</span>}</> : <span>位置节点 · {items.filter((item) => item.location === hovered.label).length} 个物品</span>}</div>}<div className="graph-legend"><span><i className="legend-item" />物品</span><span><i className="legend-location" />位置</span><span>拖拽调整 · 悬停查看</span></div></section> : <div className="graph-empty"><div className="empty-art">◉</div><h3>当前列表还没有图谱</h3><p>添加物品和位置后，关系图会自动生成。</p></div>}</>
}

import { useMemo, useState } from 'react'
import type { Item, ItemList, Page } from './types'

const lists: ItemList[] = [
  { id: 'placed', name: '放在', count: 12, icon: '⌂' },
  { id: 'stored', name: '存有', count: 8, icon: '▦' },
]

const demoItems: Item[] = [
  { id: '1', name: '电动车', listName: '放在', location: '科教楼 A 座和 C 座之间', note: '锁在靠近路灯的一侧', icon: '🚲', updatedAt: '刚刚' },
  { id: '2', name: '雨伞', listName: '放在', location: '书柜的架子上', icon: '☂', updatedAt: '昨天 18:20' },
  { id: '3', name: '备用充电线', listName: '存有', location: '床头柜第一个抽屉', note: 'USB-C，白色', icon: '⌁', updatedAt: '9 月 5 日' },
]

function Icon({ name }: { name: string }) {
  return <span className="icon" aria-hidden="true">{name}</span>
}

function App() {
  const [page, setPage] = useState<Page>('items')
  const [activeList, setActiveList] = useState('placed')
  const [items, setItems] = useState(demoItems)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showComposer, setShowComposer] = useState(false)

  const visibleItems = useMemo(() => {
    const list = lists.find((entry) => entry.id === activeList)
    return items.filter((item) => item.listName === list?.name)
  }, [activeList, items])

  const addDemoItem = (name: string, location: string) => {
    setItems((current) => [
      {
        id: crypto.randomUUID(),
        name,
        listName: lists.find((entry) => entry.id === activeList)?.name ?? '放在',
        location,
        icon: '✦',
        updatedAt: '刚刚',
      },
      ...current,
    ])
    setShowComposer(false)
  }

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">W</span><span>WHERE</span></div>
        <div className="workspace-label">我的空间</div>
        <nav className="main-nav" aria-label="主导航">
          <NavButton active={page === 'items'} icon="⌂" label="物品位置" onClick={() => setPage('items')} />
          <NavButton active={page === 'agent'} icon="✦" label="智能体" onClick={() => setPage('agent')} badge="Beta" />
          <NavButton active={page === 'profile'} icon="○" label="我的" onClick={() => setPage('profile')} />
        </nav>
        <div className="sidebar-foot">
          <div className="sync-state"><span className="status-dot" />本地数据已保存</div>
          <div className="build-label">WHERE 0.2.0 · Shell</div>
        </div>
      </aside>

      <main className="main-content">
        {page === 'items' && <ItemsPage lists={lists} activeList={activeList} setActiveList={setActiveList} items={visibleItems} onAdd={() => setShowComposer(true)} />}
        {page === 'agent' && <AgentPage onNavigateToItems={() => setPage('items')} />}
        {page === 'profile' && <ProfilePage theme={theme} setTheme={setTheme} />}
      </main>

      {showComposer && <AddComposer onClose={() => setShowComposer(false)} onAdd={addDemoItem} />}
    </div>
  )
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><Icon name={icon} /><span>{label}</span>{badge && <small>{badge}</small>}</button>
}

function ItemsPage({ lists, activeList, setActiveList, items, onAdd }: { lists: ItemList[]; activeList: string; setActiveList: (id: string) => void; items: Item[]; onAdd: () => void }) {
  return <>
    <header className="topbar"><div><div className="eyebrow">我的物品</div><h1>物品位置</h1></div><div className="topbar-actions"><button className="ghost-button" title="搜索">⌕ <span>搜索</span><kbd>⌘ K</kbd></button><button className="avatar">Z</button></div></header>
    <section className="page-intro"><div><p>把重要的东西，放在记得住的地方。</p></div><button className="primary-button" onClick={onAdd}><span>＋</span> 添加物品</button></section>
    <div className="list-tabs" role="tablist" aria-label="物品列表">
      {lists.map((list) => <button key={list.id} className={`list-tab ${activeList === list.id ? 'active' : ''}`} onClick={() => setActiveList(list.id)}><span className="tab-icon">{list.icon}</span><span>{list.name}</span><span className="tab-count">{list.count}</span></button>)}
      <button className="add-list-button" title="新建列表">＋</button>
    </div>
    <section className="items-panel"><div className="panel-heading"><div><h2>{lists.find((list) => list.id === activeList)?.name}</h2><span className="muted">按最近更新排序</span></div><button className="more-button">•••</button></div>
      {items.length ? <div className="item-list">{items.map((item) => <ItemRow key={item.id} item={item} />)}</div> : <EmptyState onAdd={onAdd} />}
    </section>
    <div className="hint-bar"><span className="hint-key">⌁</span><span>提示：右键物品可以编辑位置、查看历史或添加备注</span><span className="hint-dismiss">知道了</span></div>
  </>
}

function ItemRow({ item }: { item: Item }) {
  return <article className="item-row"><div className="item-icon">{item.icon}</div><div className="item-main"><div className="item-title"><strong>{item.name}</strong><span className="list-pill">{item.listName}</span></div><div className="item-location"><span className="location-pin">⌖</span>{item.location}</div>{item.note && <div className="item-note">▤ {item.note}</div>}</div><div className="item-meta"><span>{item.updatedAt}</span><button className="row-more" aria-label={`更多操作：${item.name}`}>•••</button></div></article>
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-art">⌂</div><h3>这里还没有物品</h3><p>从记录一件你经常找不到的东西开始。</p><button className="secondary-button" onClick={onAdd}>添加第一件物品</button></div>
}

function AgentPage({ onNavigateToItems }: { onNavigateToItems: () => void }) {
  const [message, setMessage] = useState('')
  return <><header className="topbar"><div><div className="eyebrow">WHERE AI</div><h1>智能体</h1></div><div className="agent-model"><span className="status-dot" />本地工具已就绪</div></header><section className="agent-layout"><div className="agent-welcome"><div className="sparkle">✦</div><h2>你好，我可以帮你找东西。</h2><p>告诉我物品放在哪里，或者问我它现在在哪里。所有操作都会先经过本地数据校验。</p><div className="quick-prompts"><button onClick={() => setMessage('帮我记录：雨伞放在书柜的架子上')}>记录一个物品 <span>→</span></button><button onClick={() => setMessage('我的电动车停哪了？')}>查找我的电动车 <span>→</span></button><button onClick={() => setMessage('床头柜里存放了哪些东西？')}>查看床头柜 <span>→</span></button></div></div><div className="workflow-card"><div className="workflow-title"><span>最近一次工作流</span><span className="live-pill">示例</span></div><div className="workflow-step done"><span className="step-check">✓</span><div><strong>理解请求</strong><small>识别为物品位置查询</small></div></div><div className="workflow-line" /><div className="workflow-step done"><span className="step-check">✓</span><div><strong>检索本地数据</strong><small>按“电动车”匹配 1 条记录</small></div></div><div className="workflow-line" /><div className="workflow-step current"><span className="step-check">✦</span><div><strong>整理结果</strong><small>等待下一次对话</small></div></div></div></section><section className="chat-composer"><div className="composer-tools"><span className="composer-icon">✦</span><span>使用 WHERE 智能体</span><span className="composer-divider" /><button>＋ 添加上下文</button></div><div className="composer-input"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="问问你的物品在哪里……" /><button className="send-button" onClick={onNavigateToItems} disabled={!message}>↑</button></div><div className="composer-foot">智能体会使用你当前账号中的本地数据　·　<button>了解能力范围</button></div></section></>
}

function ProfilePage({ theme, setTheme }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void }) {
  return <><header className="topbar"><div><div className="eyebrow">设置与账户</div><h1>我的</h1></div><button className="avatar large">Z</button></header><section className="profile-content"><div className="profile-card"><div className="profile-avatar">Z</div><div><h2>ZYX</h2><p>本地账号　·　数据只保存在此设备</p></div><button className="outline-button">切换账号</button></div><div className="settings-section"><div className="section-label">外观</div><div className="setting-row"><div><strong>主题</strong><span>选择 WHERE 的显示风格</span></div><div className="theme-switcher"><button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}>☼ 明亮</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>◐ 夜间</button></div></div></div><div className="settings-section"><div className="section-label">数据与安全</div><SettingRow icon="⌁" title="设备同步" description="在 PC 和手机之间安全同步" arrow /><SettingRow icon="↥" title="备份与恢复" description="导出或导入本地数据" arrow /><SettingRow icon="▤" title="历史记录" description="查看所有数据变更" arrow /></div><div className="settings-section"><div className="section-label">帮助</div><SettingRow icon="?" title="使用说明" description="了解 WHERE 的基本用法" arrow /><SettingRow icon="i" title="关于 WHERE" description="版本 0.2.0 · MIT License" arrow /></div></section></>
}

function SettingRow({ icon, title, description, arrow }: { icon: string; title: string; description: string; arrow?: boolean }) {
  return <button className="setting-row setting-button"><span className="setting-icon">{icon}</span><span className="setting-copy"><strong>{title}</strong><span>{description}</span></span>{arrow && <span className="setting-arrow">›</span>}</button>
}

function AddComposer({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, location: string) => void }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">快速记录</div><h2>添加物品</h2></div><button className="close-button" onClick={onClose}>×</button></div><label>物品名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：钥匙、雨伞" /></label><label>位置<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：玄关柜的第二层" /></label><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!name.trim() || !location.trim()} onClick={() => onAdd(name.trim(), location.trim())}>保存物品</button></div><p className="modal-note">V0.2 演示数据会在当前页面内更新；SQLite 持久化将在下一阶段接入。</p></div></div>
}

export default App
